'use client';
import { logClientError } from '@/lib/clientLogger';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import DocumentDownloadWarning from '@/components/DocumentDownloadWarning';
import DocumentMessaging from '@/components/DocumentMessaging';
import WorkflowActivityTimeline from '@/components/WorkflowActivityTimeline';
import WorkflowRevisionTimeline from '@/components/WorkflowRevisionTimeline';
import FilePreview, { downloadFile, getFileUrl, type PreviewableFile } from '@/components/FilePreview';
import {
  getWorkflowFileMimeType,
  getWorkflowFilesTypeError,
} from '@/lib/workflow/file-types';
import { getSubmissionStatusLabel, getSubmissionStatusTone } from '@/lib/workflow/status';
import { getAvailableActions } from '@/lib/workflow/action-availability';
import {
  ASSIGNMENT_TONE_CLASSES,
  describeAssignmentState,
  getOfficeLabel,
  summarizeAssignment,
  type AssignmentOutcome,
} from '@/lib/workflow/assignments';
import {
  getOfficeFileManagementPath,
  getWorkflowDocumentTypeLabel,
  getWorkflowSubmissionTitle,
  isOfficeRole,
  OFFICE_CONFIG,
  OFFICE_RESPONSIBILITIES,
  type OfficeResponsibility,
  type OfficeRole,
} from '@/lib/workflow/offices';
import {
  type WorkflowRevisionHistory,
} from '@/lib/workflow/revisions';
import { loadWorkflowSubmissionDetail } from '@/lib/workflow/submission-detail';
import { useSubmissionDetailRealtime } from '@/lib/workflow/useSubmissionDetailRealtime';
import { useWorkflowAccount } from '@/lib/workflow/role-context';

// ─── Styles & Fonts (synced with the user file page) ─────────────────────────
const fonts = {
  serif: 'font-serif',
};

// ─── Icons & small UI helpers ────────────────────────────────────────────────
type IconName = 'arrow-left' | 'calendar' | 'chevron-right' | 'download' | 'eye' | 'file' | 'paperclip' | 'user';

function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, ReactNode> = {
    'arrow-left': (<><path d="m15 18-6-6 6-6" /><path d="M21 12H9" /></>),
    calendar: (<><path d="M8 2v4M16 2v4M3 10h18" /><rect x="3" y="4" width="18" height="18" rx="2" /></>),
    'chevron-right': <path d="m9 18 6-6-6-6" />,
    download: (<><path d="M12 3v12m0 0 4-4m-4 4-4-4" /><path d="M5 20h14" /></>),
    eye: (<><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>),
    file: (<><path d="M6 2h8l4 4v16H6z" /><path d="M14 2v5h5M9 13h6M9 17h6" /></>),
    paperclip: <path d="m20 11-8.5 8.5a5 5 0 0 1-7-7L14 3a3.5 3.5 0 0 1 5 5l-9.5 9.5a2 2 0 0 1-3-3L15 6" />,
    user: (<><circle cx="12" cy="8" r="4" /><path d="M4 22a8 8 0 0 1 16 0" /></>),
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

function Label({ children }: { children: ReactNode }) {
  return (
    <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-text">{children}</p>
  );
}

interface Submission extends PreviewableFile {
  id: string;
  user_id: string;
  tracking_number?: string | null;
  file_name: string;
  file_url: string;
  file_path?: string | null;
  file_type: string;
  file_size: number;
  status: string;
  current_revision_id?: string | null;
  reopen_count?: number | null;
  category?: string | null;
  other_document_type?: string | null;
  description?: string | null;
  purpose?: string | null;
  requested_action?: string | null;
  intended_recipient?: string | null;
  selected_office_role?: string | null;
  initial_destination_role?: string | null;
  final_decision_office_role?: string | null;
  final_decided_at?: string | null;
  final_decision_by?: string | null;
  approved_at?: string | null;
  rejected_at?: string | null;
  approver_comments?: string | null;
  office_comments?: string | null;
  rejection_comment?: string | null;
  admin_comments?: string | null;
  mayor_comments?: string | null;
  sender_response?: string | null;
  created_at: string;
  updated_at: string;
  received_by?: string | null;
  received_at?: string | null;
  closed_by?: string | null;
  completed_at?: string | null;
  closure_note?: string | null;
  closure_file_path?: string | null;
  closure_file_name?: string | null;
  closure_file_type?: string | null;
  closure_file_size?: number | null;
}

// Readable role names for activity entries (requestee and admin are not offices).
const getActorRoleLabel = (actorRole: string | null | undefined) => {
  if (!actorRole) return null;
  if (actorRole === 'submitter') return 'Requestee';
  if (actorRole === 'system_admin') return 'System Administrator';
  return getOfficeLabel(actorRole);
};

interface SupportingAttachment {
  id: string;
  file_name: string;
  file_path: string;
  file_type: string | null;
  file_size: number;
}

interface RouteStep {
  id: string;
  routing_plan_id: string;
  sequence_number: number;
  office_role: OfficeRole;
  status: string;
  assigned_by: string | null;
  assigned_by_role: string | null;
  responsibility: OfficeResponsibility;
  assignment_source: string;
  assigned_at: string | null;
  started_at: string | null;
  decided_at: string | null;
  decided_by: string | null;
  completed_at: string | null;
  completed_by: string | null;
  comments: string | null;
  outcome: string | null;
  requirements_requested_at: string | null;
  requirements_comments: string | null;
}

interface SenderProfile {
  email: string | null;
  full_name: string | null;
  role: string | null;
}

interface AuditLog {
  id: string;
  action_type: string;
  created_at: string;
  comments: string | null;
  profiles: SenderProfile | null;
}

// ─── Status groups ───────────────────────────────────────────────────────────
const QUEUE_STATUSES = ['pending', 'pending_approver'];
const DECLINED_STATUSES = [
  'declined_by_approver',
  'declined_by_admin',
  'declined_by_office',
  'declined_by_mayor',
  'rejected',
];

const getStatusStyles = (status: string) => {
  const s = (status || '').toLowerCase();
  const tone = getSubmissionStatusTone(s);
  if (tone === 'pending') return { label: getSubmissionStatusLabel(s), classes: 'bg-pending-bg text-pending-text' };
  if (tone === 'progress') return { label: getSubmissionStatusLabel(s), classes: 'bg-review-bg text-review-text' };
  if (tone === 'completed') return { label: getSubmissionStatusLabel(s), classes: 'bg-approved-bg text-approved-text' };
  if (tone === 'returned') return { label: getSubmissionStatusLabel(s), classes: 'bg-pending-bg text-pending-text' };
  if (tone === 'withdrawn') return { label: getSubmissionStatusLabel(s), classes: 'bg-sidebar text-muted-text' };
  if (QUEUE_STATUSES.includes(s)) return { label: 'Tourism Office processing', classes: 'bg-pending-bg text-pending-text' };
  if (s === 'pending_admin') return { label: 'Administrative review', classes: 'bg-review-bg text-review-text' };
  if (s === 'pending_office') return { label: 'Office processing', classes: 'bg-review-bg text-review-text' };
  if (s === 'pending_mayor') return { label: "Mayor's office processing", classes: 'bg-review-bg text-review-text' };
  if (s === 'returned_for_requirements') return { label: 'Closed — Changes Requested', classes: 'bg-pending-bg text-pending-text' };
  if (s === 'completed') return { label: 'Completed', classes: 'bg-approved-bg text-approved-text' };
  if (s === 'approved') return { label: 'Approved', classes: 'bg-approved-bg text-approved-text' };
  if (DECLINED_STATUSES.includes(s)) return { label: 'Rejected', classes: 'bg-rejected-bg text-rejected-text' };
  return { label: s.replaceAll('_', ' ') || 'Unknown', classes: 'bg-sidebar text-muted-text' };
};

const getActionLabel = (type: string) => {
  switch (type) {
    case 'DESTINATION_SELECTED': return 'Destination selected by requestee';
    case 'SUBMISSION_REDIRECTED': return 'Submission redirected';
    case 'SUBMISSION_RECEIVED': return 'Submission received by office';
    case 'SUBMISSION_FORWARDED': return 'Recommendation requested';
    case 'ASSIGNMENT_COMPLETED': return 'Office responded to assignment';
    case 'ASSIGNMENT_RETURNED': return 'Office assignment returned';
    case 'ASSIGNMENT_WITHDRAWN': return 'Office assignment withdrawn';
    case 'CHANGES_REQUESTED': return 'Changes requested';
    case 'CHANGES_RESPONDED': return 'Requestee responded to changes';
    case 'RETURNED_TO_SUBMITTER': return 'Returned to requestee for redirection';
    case 'SUBMISSION_WITHDRAWN': return 'Submission withdrawn';
    case 'SUBMISSION_CLOSED': return 'Submission completed';
    case 'SUBMISSION_APPROVED': return 'Submission approved';
    case 'SUBMISSION_REJECTED': return 'Submission rejected';
    case 'SUBMISSION_REOPENED': return 'Requestee resubmitted a revision';
    case 'SUBMISSION_PERMANENTLY_CLOSED': return 'Requestee permanently closed the submission';
    case 'FILE_VERSION_ADDED': return 'Document version added';
    case 'STAGE_1_AUTHORIZED': return 'Stage 1 approved';
    case 'STAGE_1_REJECTED': return 'Stage 1 rejected';
    case 'FINAL_AUTHORIZATION': return 'Final approval';
    case 'FINAL_REJECTION': return 'Final rejection';
    case 'VERIFICATION_PASSED': return 'Verification passed';
    case 'RETURNED_FOR_CORRECTION': return 'Returned for correction';
    case 'OFFICE_ROUTE_STEP_ASSIGNED': return 'Office route step assigned';
    case 'OFFICE_ROUTE_STEP_APPROVED': return 'Office route step approved';
    case 'OFFICE_ASSIGNMENT_COMPLETED': return 'Office assignment completed';
    case 'OFFICE_ASSIGNMENT_FORWARDED': return 'Recommendation requested from another office';
    case 'OFFICE_ASSIGNMENT_FORWARDED_ONWARD': return 'Office assignment forwarded onward';
    case 'OFFICE_FORWARDED_TO_TOURISM_OFFICER': return 'Sent to Tourism Officer for review';
    case 'TOURISM_OFFICER_ASSIGNMENTS_CREATED': return 'Tourism Officer assigned additional offices';
    case 'TOURISM_OFFICER_ASSIGNMENTS_COMPLETED': return 'Additional office assignments completed';
    case 'OFFICE_FINAL_DECISION': return 'Final decision by authorized office';
    case 'ROUTE_PROPOSED': return 'Tourism Officer proposed office route';
    case 'REVISED_DOCUMENT_SUBMITTED': return 'Requestee uploaded a revised document';
    case 'REQUIREMENTS_RESUBMITTED': return 'Requestee responded to requested changes';
    case 'ROUTE_REQUIREMENTS_REQUESTED': return 'Municipal office requested additional requirements';
    case 'ROUTE_RETURNED_TO_ADMIN': return 'All routed offices approved; returned to Admin';
    case 'APPROVER_REJECTED': return 'Approver rejected request';
    case 'ADMIN_REJECTED': return 'Administrator rejected request';
    case 'OFFICE_REJECTED': return 'Municipal office rejected request';
    case 'MAYOR_REJECTED': return 'Mayor rejected request';
    case 'WORKFLOW_COMPLETED': return 'Workflow completed';
    case 'SUBMITTED': return 'Submission submitted';
    default: return 'Action by';
  }
};

export default function ApproverManagePage({ readOnly = false }: { readOnly?: boolean }) {
  const { id } = useParams();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { userId: accountUserId, role: accountRole, ready: accountReady } = useWorkflowAccount();
  const role = accountRole;

  const [sub, setSub] = useState<Submission | null>(null);
  const [sender, setSender] = useState<SenderProfile | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [revisionHistory, setRevisionHistory] = useState<WorkflowRevisionHistory | null>(null);
  const [revisionHistoryLoading, setRevisionHistoryLoading] = useState(true);
  const [revisionHistoryError, setRevisionHistoryError] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<SupportingAttachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [updating, setUpdating] = useState(false);
  const [actionError, setActionError] = useState('');
  const [routeSteps, setRouteSteps] = useState<RouteStep[]>([]);
  const [currentRoutePlanId, setCurrentRoutePlanId] = useState<string | null>(null);
  const [routePlanIds, setRoutePlanIds] = useState<string[]>([]);
  const [routeStatus, setRouteStatus] = useState<string | null>(null);
  const [routeStateError, setRouteStateError] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [supportingAttachmentsOpen, setSupportingAttachmentsOpen] = useState(true);
  const [previewingAttachmentId, setPreviewingAttachmentId] = useState<string | null>(null);
  const [activeDetailTab, setActiveDetailTab] = useState<'conversation' | 'activity' | 'versions'>('conversation');
  const fetchDetails = useCallback(async () => {
    if (!accountReady) return;
    setLoadError('');
    setRevisionHistoryLoading(true);
    setRevisionHistoryError(null);
    // Clear errors from an earlier load; anything still wrong is reported again below.
    setActionError('');
    try {
      if (!accountUserId) throw new Error('An active account is required to view this submission.');
      if (typeof id !== 'string') throw new Error('Could not determine which submission to load.');
      const detail = await loadWorkflowSubmissionDetail(supabase, id);

      setSub(detail.submission);
      setSender(detail.sender);
      setAuditLogs(detail.activityLogs);
      setRouteSteps(detail.routeSteps.filter(
        (step): step is RouteStep => isOfficeRole(step.office_role)
          && step.responsibility in OFFICE_RESPONSIBILITIES,
      ));
      setRoutePlanIds(detail.routePlanIds);
      setCurrentRoutePlanId(detail.currentRoute?.id ?? null);
      setRouteStatus(detail.currentRoute?.status ?? null);
      setRouteStateError(false);
      setRevisionHistory(detail.revisionHistory);
      setAttachments(detail.supportingFiles);
    } catch (err) {
      logClientError('Failed to load submission:', err);
      setLoadError(err instanceof Error ? err.message : 'Could not load this submission.');
      setRouteStateError(true);
      setRevisionHistoryError('Could not load the file version history. Refresh this page to try again.');
    } finally {
      setLoading(false);
      setRevisionHistoryLoading(false);
    }
  }, [accountReady, accountUserId, id, supabase]);

  useEffect(() => { fetchDetails(); }, [fetchDetails]);

  const refreshSubmissionDetail = useCallback(() => {
    void fetchDetails();
  }, [fetchDetails]);

  useSubmissionDetailRealtime(
    supabase,
    typeof id === 'string' ? id : null,
    routePlanIds,
    refreshSubmissionDetail,
  );

  const assignmentConversations = useMemo(() => routeSteps.flatMap((step) => {
    if (
      !['office_forward', 'tourism_officer'].includes(step.assignment_source)
      || !isOfficeRole(role)
      || (step.office_role !== role && step.assigned_by_role !== role)
      || !isOfficeRole(step.assigned_by_role)
    ) {
      return [];
    }

    const stepOpen = step.status === 'in_progress';
    return [{
      stepId: step.id,
      label: `${OFFICE_CONFIG[step.assigned_by_role].label} ↔ ${OFFICE_CONFIG[step.office_role].label}`,
      canSend: stepOpen
        && !['changes_requested', 'returned_for_requirements', 'completed', 'approved', 'declined_by_approver', 'declined_by_admin', 'declined_by_office', 'declined_by_mayor', 'rejected', 'withdrawn'].includes(sub?.status ?? ''),
      closedSummary: stepOpen
        ? undefined
        : `${summarizeAssignment(step)}.${step.comments ? ` Note: ${step.comments}` : ''}`,
    }];
  }), [role, routeSteps, sub?.status]);

  const downloadAttachment = async (attachment: SupportingAttachment) => {
    const { data, error } = await supabase.storage
      .from('workflow_uploads')
      .createSignedUrl(attachment.file_path, 300);
    if (error || !data?.signedUrl) {
      logClientError('Could not authorize attachment download:', error?.message);
      setActionError('Could not open this supporting attachment. Please try again.');
      return;
    }
    await downloadFile(data.signedUrl, attachment.file_name);
  };

  const handleWorkflowAction = async (
    action: string,
    recipient: string,
    message: string,
    files: File[],
  ) => {
    if (readOnly) throw new Error('This submission view is read-only.');
    if (!sub) throw new Error('Submission is unavailable.');
    if (action === 'close_submission') {
      await closeSubmission(message, files[0] ?? null);
      return;
    }
    if ((action === 'approve' || action === 'reject') && isRecipientOffice) {
      if (routeStateError) {
        throw new Error('Could not verify the office assignment. Refresh and try again.');
      }
      if (action === 'reject' && !message.trim()) {
        throw new Error('Explain why your office rejects this assignment.');
      }
      setUpdating(true);
      setActionError('');
      try {
        const { error } = await supabase.rpc('complete_workflow_assignment', {
          target_submission_id: sub.id,
          completion_notes: message.trim() || null,
          assignment_outcome: action === 'approve' ? 'endorsed' : 'not_endorsed',
        });
        if (error) throw new Error(error.message || `Could not ${action} this assignment.`);
        await fetchDetails();
      } finally {
        setUpdating(false);
      }
      return;
    }
    if (action === 'approve' || action === 'reject') {
      setUpdating(true);
      setActionError('');
      try {
        const { error } = await supabase.rpc('decide_workflow_submission_as_responsible_office', {
          target_submission_id: sub.id,
          final_decision: action,
          decision_comments: message.trim() || null,
        });
        if (error) throw new Error(error.message || `Could not ${action} this submission.`);
        await fetchDetails();
      } finally {
        setUpdating(false);
      }
      return;
    }
    setUpdating(true);
    setActionError('');
    try {
      if (routeStateError && ['complete_assignment', 'return_assignment', 'withdraw_assignment'].includes(action)) {
        throw new Error('Could not verify the office assignment. Refresh and try again.');
      }

      const targetOfficeRole = recipient.replace(/^office:/, '');
      const activeAssignment = routeSteps.find((step) =>
        step.routing_plan_id === currentRoutePlanId
        && step.office_role === targetOfficeRole
        && (step.status === 'pending' || step.status === 'in_progress')
      );
      let rpcName:
        | 'request_workflow_submission_changes'
        | 'return_workflow_submission_to_submitter'
        | 'complete_workflow_assignment'
        | 'return_workflow_assignment'
        | 'withdraw_workflow_assignment';
      let rpcArgs:
        | { target_submission_id: string; request_comments: string; expected_revision_id: string }
        | { target_submission_id: string; return_reason: string }
        | { target_submission_id: string; completion_notes: string | null; assignment_outcome: AssignmentOutcome | null }
        | { target_submission_id: string; target_assignment_office_role: string; withdrawal_reason: string };
      if (action === 'request_changes') {
        if (!sub.current_revision_id) {
          throw new Error('The current submission revision is unavailable. Refresh and try again.');
        }
        rpcName = 'request_workflow_submission_changes';
        rpcArgs = {
          target_submission_id: sub.id,
          request_comments: message.trim(),
          expected_revision_id: sub.current_revision_id,
        };
      } else if (action === 'return_to_submitter') {
        rpcName = 'return_workflow_submission_to_submitter';
        rpcArgs = { target_submission_id: sub.id, return_reason: message.trim() };
      } else if (action === 'complete_assignment') {
        rpcName = 'complete_workflow_assignment';
        rpcArgs = {
          target_submission_id: sub.id,
          completion_notes: message.trim() || null,
          assignment_outcome: null,
        };
      } else if (action === 'return_assignment') {
        rpcName = 'return_workflow_assignment';
        rpcArgs = { target_submission_id: sub.id, return_reason: message.trim() };
      } else if (action === 'withdraw_assignment' && activeAssignment) {
        rpcName = 'withdraw_workflow_assignment';
        rpcArgs = {
          target_submission_id: sub.id,
          target_assignment_office_role: activeAssignment.office_role,
          withdrawal_reason: message.trim(),
        };
      } else {
        throw new Error('This action is unavailable for the selected office.');
      }

      const { error } = await supabase.rpc(rpcName, rpcArgs);
      if (error) throw new Error(error.message || 'Could not complete the workflow action.');
      await fetchDetails();
    } finally {
      setUpdating(false);
    }
  };

  const closeSubmission = async (closureNote: string, closureFile: File | null) => {
    if (!sub) throw new Error('Submission is unavailable.');
    setUpdating(true);
    setActionError('');
    let filePath: string | null = null;
    try {
      let userId: string | null = null;
      let fileType: string | null = null;
      if (closureFile) {
        const fileError = getWorkflowFilesTypeError([closureFile], false);
        if (fileError) throw new Error(fileError);
        if (closureFile.size > 100 * 1024 * 1024) {
          throw new Error('The completion document must be 100 MB or smaller.');
        }
        if (!accountUserId) throw new Error('You must sign in to complete this submission.');
        userId = accountUserId;
        fileType = getWorkflowFileMimeType(closureFile.name);
        if (!fileType) throw new Error('The completion document type is not supported.');
        filePath = `${userId}/${crypto.randomUUID()}-closure-${closureFile.name.replace(/[^\w.-]/g, '_')}`;
        const { error: uploadError } = await supabase.storage
          .from('workflow_uploads')
          .upload(filePath, closureFile, { contentType: fileType, upsert: false });
        if (uploadError) throw uploadError;
      }

      const { error } = await supabase.rpc('close_workflow_submission_with_details', {
        target_submission_id: sub.id,
        closure_note: closureNote.trim() || null,
        closure_file_path: filePath,
        closure_file_name: closureFile?.name ?? null,
        closure_file_type: fileType,
        closure_file_size: closureFile?.size ?? null,
      });
      if (error) throw error;

      await fetchDetails();
    } catch (error) {
      if (filePath) {
        const { error: cleanupError } = await supabase.storage.from('workflow_uploads').remove([filePath]);
        if (cleanupError) logClientError('Could not clean up unlinked closure file:', cleanupError.message);
      }
      throw error instanceof Error ? error : new Error('Could not complete this submission.');
    } finally {
      setUpdating(false);
    }
  };

  if (loading) {
    return (
      <div className="w-full">
        <div className="flex items-center gap-3 rounded-2xl border border-warm-border bg-card px-5 py-8 text-xs text-muted-text">
          <span className="h-2 w-2 animate-pulse rounded-full bg-clay" /> Loading submission...
        </div>
      </div>
    );
  }

  if (!sub) {
    return (
      <div className="w-full">
        <div className={`rounded-2xl border px-5 py-8 text-xs font-semibold ${
          loadError
            ? 'border-rejected-bg bg-rejected-bg/50 text-rejected-text'
            : 'border-warm-border bg-card text-muted-text'
        }`}>
          <p>{loadError || 'Submission not found.'}</p>
          {loadError && (
            <button
              type="button"
              onClick={() => {
                setLoading(true);
                void fetchDetails();
              }}
              className="mt-4 rounded-full border border-current px-4 py-2 font-bold hover:bg-white/50"
            >
              Try again
            </button>
          )}
        </div>
      </div>
    );
  }

  const statusConfig = getStatusStyles(sub.status);
  const currentPlanSteps = routeSteps.filter((step) => step.routing_plan_id === currentRoutePlanId);
  const activeRouteStep = isOfficeRole(role)
    ? currentPlanSteps.find((step) => step.office_role === role && ['pending', 'in_progress'].includes(step.status))
    : undefined;
  const hasOfficeAssignment = isOfficeRole(role)
    && routeSteps.some((step) => step.office_role === role && step.status !== 'skipped');
  const selectedOfficeRole = sub.selected_office_role ?? null;
  const initialDestinationRole = sub.initial_destination_role ?? null;
  const senderRole = sender?.role ?? null;
  const originatingOfficeRole = isOfficeRole(senderRole) ? senderRole : null;
  const responsibleOfficeRole = selectedOfficeRole
    ?? (isOfficeRole(initialDestinationRole) ? initialDestinationRole : null);
  const isResponsibleOffice = isOfficeRole(role) && role === responsibleOfficeRole;
  const isRecipientOffice = Boolean(activeRouteStep) && !isResponsibleOffice;
  const activeAssignmentCreatedByCurrentOffice = isOfficeRole(role)
    && currentPlanSteps.some((step) =>
      step.assigned_by_role === role && ['pending', 'in_progress'].includes(step.status)
    );
  const officeReview = readOnly || isResponsibleOffice || hasOfficeAssignment || activeAssignmentCreatedByCurrentOffice;
  const activeAssignments = currentPlanSteps.filter((step) =>
    step.status === 'pending' || step.status === 'in_progress'
  );
  const pendingAssignments = activeAssignments.filter((step) =>
    !isResponsibleOffice || step.office_role !== responsibleOfficeRole
  );
  const pendingAssignmentCount = pendingAssignments.length;
  const isCompleted = sub.status === 'completed' || sub.status === 'approved';
  const isRejected = DECLINED_STATUSES.includes(sub.status);
  const isWithdrawn = sub.status === 'withdrawn';
  const isChangesRequested = sub.status === 'changes_requested'
    || sub.status === 'returned_for_requirements';
  const waitingAssignmentNames = pendingAssignments.map((step) => OFFICE_CONFIG[step.office_role].label);
  const activeOfficeConversation = currentPlanSteps.find((step) =>
    ['office_forward', 'tourism_officer'].includes(step.assignment_source)
    && ['pending', 'in_progress'].includes(step.status)
    && (step.office_role === role || step.assigned_by_role === role)
  );
  const defaultAssignmentStepId = isResponsibleOffice
    ? null
    : activeOfficeConversation?.id
      ?? [...routeSteps].reverse().find((step) =>
        ['office_forward', 'tourism_officer'].includes(step.assignment_source)
        && (step.office_role === role || step.assigned_by_role === role)
      )?.id
      ?? null;
  const pendingAssignmentReason = pendingAssignments.length > 0
    ? `Waiting for ${waitingAssignmentNames.join(', ')} to finish`
    : '';
  const availableOfficeActions = getAvailableActions({
    status: sub.status,
    selected_office_role: responsibleOfficeRole,
    reopen_count: sub.reopen_count,
  }, activeAssignments, isResponsibleOffice ? 'responsible_office' : isRecipientOffice ? 'assigned_office' : 'system_admin');
  const statusLine = `${statusConfig.label}${pendingAssignmentReason ? ` · ${pendingAssignmentReason}` : ''}`;
  const requiresReviewStart = (
    isResponsibleOffice && ['submitted', 'pending_office'].includes(sub.status)
  ) || (
    isRecipientOffice && activeRouteStep?.status === 'pending'
  );
  // Mirrors decide_workflow_submission_as_responsible_office: only the office recorded
  // as the decision office (or the original destination) may approve or reject.
  const decisionOfficeRole = sub.final_decision_office_role ?? initialDestinationRole;
  const decisionAuthorityReason = decisionOfficeRole && decisionOfficeRole !== role
    ? `Only ${getOfficeLabel(decisionOfficeRole)} can approve or reject this submission`
    : undefined;
  const decisionStatusReason = sub.status !== 'in_process'
    ? 'Available only while status is In Process'
    : undefined;
  const responsibleOfficeActions = [
    {
      value: 'request_changes',
      label: 'Request changes or information',
      groupLabel: 'Send back',
      description: 'Close office processing while the requestee reviews the request. Any later resubmission returns to your office.',
      tone: 'primary' as const,
      requiresMessage: true,
      successMessage: 'Changes requested. The requestee has been notified.',
      unavailableReason: routeStateError
        ? 'Could not verify whether an assignment is pending'
        : pendingAssignmentReason
          || (sub.status !== 'in_process'
            ? 'Available only while status is In Process'
            : (sub.reopen_count ?? 0) > 0
              ? 'Request changes is unavailable after this submission has been reopened'
              : !sub.current_revision_id
                ? 'The current submission revision is unavailable. Refresh and try again.'
                : !availableOfficeActions.includes('request_changes')
                  ? 'This action is unavailable in the current workflow state'
                  : undefined),
    },
    {
      value: 'approve',
      label: 'Approve request',
      buttonLabel: 'Approve request',
      groupLabel: 'Decision',
      description: 'Record the responsible office’s final approval. The requestee can then create a pickup QR; this does not release the document.',
      tone: 'primary' as const,
      confirmation: 'Approve this request? The requestee will be notified and can create a pickup QR. Authorized staff must still verify identity and record the handover.',
      successMessage: 'Submission approved. The requestee has been notified.',
      unavailableReason: routeStateError
        ? 'Could not verify whether an office assignment is pending'
        : pendingAssignmentReason || decisionStatusReason || decisionAuthorityReason,
    },
    {
      value: 'reject',
      label: 'Reject request',
      buttonLabel: 'Reject request',
      groupLabel: 'Decision',
      description: 'Record the responsible office’s final rejection. The request will not be eligible for pickup. A reason is required.',
      tone: 'warning' as const,
      requiresMessage: true,
      confirmation: 'Reject this request? The requestee will be notified and the final decision recorded.',
      successMessage: 'Submission rejected. The requestee has been notified.',
      unavailableReason: routeStateError
        ? 'Could not verify whether an office assignment is pending'
        : pendingAssignmentReason || decisionStatusReason || decisionAuthorityReason,
    },
    {
      value: 'return_to_submitter',
      label: 'Return for redirection',
      groupLabel: 'Other actions',
      description: 'Return this submission so the requestee can choose a different destination office.',
      tone: 'warning' as const,
      requiresMessage: true,
      confirmation: 'The submission will return to the requestee so they can choose the correct office. This is not a rejection.',
      successMessage: 'Submission returned to the requestee for redirection.',
      unavailableReason: !['submitted', 'in_process'].includes(sub.status)
        ? 'Available only while status is Submitted or In Process'
        : undefined,
    },
    {
      value: 'close_submission',
      label: 'Complete request',
      buttonLabel: 'Complete request',
      groupLabel: 'Finish',
      description: 'Finish processing without recording approval or rejection. The requestee can then create a pickup QR; this does not release the document.',
      tone: 'strong' as const,
      successMessage: 'Submission completed. The requestee has been notified.',
      unavailableReason: routeStateError
        ? 'Could not verify whether an assignment is pending'
        : pendingAssignmentReason
          || (sub.status !== 'in_process'
            ? 'Available only while status is In Process'
            : undefined),
    },
  ];
  const actionsByRecipient: Record<string, {
    value: string;
    label: string;
    buttonLabel?: string;
    groupLabel?: string;
    description?: string;
    tone?: 'neutral' | 'primary' | 'warning' | 'strong';
    requiresMessage?: boolean;
    unavailableReason?: string;
    confirmation?: string;
    successMessage?: string;
  }[]> = {};
  const recipients: { value: string; label: string }[] = [];
  let initialRecipient = 'responsible_office';
  let initialAction = 'request_changes';

  if (isResponsibleOffice) {
    recipients.push({ value: 'submitter', label: 'Requestee' });
    actionsByRecipient.submitter = responsibleOfficeActions;
    for (const officeRole of Object.keys(OFFICE_CONFIG)
      .filter(isOfficeRole)
      .filter((office) =>
        office !== role
        && office !== responsibleOfficeRole
        && office !== originatingOfficeRole
      )) {
      const targetAssignment = pendingAssignments.find(
        (step) => step.office_role === officeRole && step.status === 'pending'
      );
      const forwardReason = routeStateError
        ? 'Could not verify the office assignment'
        : pendingAssignmentReason
          || (sub.status !== 'in_process' ? 'Available only while status is In Process' : undefined)
          || (officeRole === selectedOfficeRole ? 'Choose an office other than your own' : undefined);
      const recipientValue = `office:${officeRole}`;
      recipients.push({ value: recipientValue, label: OFFICE_CONFIG[officeRole].label });
      const currentDocumentReason = !sub.file_path
        ? 'Current document is unavailable to send to another office'
        : sub.file_size > 100 * 1024 * 1024
          ? 'Current document exceeds the 100 MB limit for sending to another office'
          : undefined;
      actionsByRecipient[recipientValue] = [
        {
          value: 'forward',
          label: 'Forward',
          buttonLabel: 'Forward',
          groupLabel: 'Route to another office',
          description: isResponsibleOffice
            ? `Send this submission to ${OFFICE_CONFIG[officeRole].label} for a recommendation; your office remains responsible for the final decision.`
            : `Send this assignment to ${OFFICE_CONFIG[officeRole].label} for a recommendation. Your assignment will be marked complete.`,
          tone: 'primary',
          unavailableReason: currentDocumentReason || forwardReason,
        },
        {
          value: 'withdraw_assignment',
          label: 'Withdraw assignment',
          groupLabel: 'Other actions',
          description: `Withdraw only the assignment with ${OFFICE_CONFIG[officeRole].label}; the submission itself stays open.`,
          tone: 'warning',
          requiresMessage: true,
          confirmation: `The pending assignment with ${OFFICE_CONFIG[officeRole].label} will be withdrawn.`,
          successMessage: `Assignment with ${OFFICE_CONFIG[officeRole].label} withdrawn.`,
          unavailableReason: targetAssignment
            ? routeStateError
              ? 'Could not verify the office assignment'
              : sub.status !== 'in_process'
                ? 'Available only while the submission is In Process'
                : undefined
            : `No unreceived pending assignment with ${OFFICE_CONFIG[officeRole].label}`,
        },
      ];
    }
    initialRecipient = 'submitter';
  } else if (isRecipientOffice) {
    recipients.push({ value: 'responsible_office', label: 'Responsible office' });
    actionsByRecipient.responsible_office = [
      {
        value: 'complete_assignment',
        label: 'Complete assignment',
        buttonLabel: 'Complete assignment',
        groupLabel: 'Finish',
        description: 'Mark only your office’s assignment handled. This does not approve or complete the request. Add a note for the responsible office if useful.',
        tone: 'primary',
        successMessage: 'Assignment completed. The responsible office has been notified.',
        unavailableReason: routeStateError ? 'Could not verify your office assignment' : undefined,
      },
      {
        value: 'approve',
        label: 'Recommend approval',
        groupLabel: 'Recommendation',
        description: 'Send your office’s approval recommendation to the responsible office. This is not the final decision and does not enable pickup.',
        tone: 'primary',
        successMessage: 'Approval sent. The responsible office has been notified.',
        unavailableReason: routeStateError ? 'Could not verify your office assignment' : undefined,
      },
      {
        value: 'reject',
        label: 'Recommend rejection',
        groupLabel: 'Recommendation',
        description: 'Send your office’s rejection recommendation to the responsible office. This is not the final decision. A reason is required.',
        tone: 'warning',
        requiresMessage: true,
        successMessage: 'Rejection sent. The responsible office has been notified.',
        unavailableReason: routeStateError ? 'Could not verify your office assignment' : undefined,
      },
      {
        value: 'return_assignment',
        label: 'Return to responsible office',
        groupLabel: 'Other actions',
        description: 'Send this assignment back to the responsible office with your reason.',
        tone: 'warning',
        requiresMessage: true,
        confirmation: 'The assignment will be returned to the responsible office with your reason.',
        successMessage: 'Assignment returned to the responsible office.',
        unavailableReason: routeStateError ? 'Could not verify your office assignment' : undefined,
      },
    ];
    for (const officeRole of Object.keys(OFFICE_CONFIG)
      .filter(isOfficeRole)
      .filter((office) =>
        office !== role
        && office !== responsibleOfficeRole
        && office !== originatingOfficeRole
      )) {
      const recipientValue = `office:${officeRole}`;
      const currentDocumentReason = !sub.file_path
        ? 'Current document is unavailable to send to another office'
        : sub.file_size > 100 * 1024 * 1024
          ? 'Current document exceeds the 100 MB limit for sending to another office'
          : undefined;
      recipients.push({ value: recipientValue, label: OFFICE_CONFIG[officeRole].label });
      actionsByRecipient[recipientValue] = [
        {
          value: 'forward',
          label: 'Forward',
          buttonLabel: 'Forward',
          groupLabel: 'Route to another office',
          description: `Send this assignment to ${OFFICE_CONFIG[officeRole].label} for a recommendation. Your assignment will be marked complete.`,
          tone: 'primary',
          unavailableReason: currentDocumentReason
            || (routeStateError ? 'Could not verify the office assignment' : undefined)
            || (sub.status !== 'in_process' ? 'Available only while status is In Process' : undefined),
        },
      ];
    }
  }
  // Open the action list on the first action that can actually be taken.
  initialAction = (actionsByRecipient[initialRecipient] ?? []).find((action) => !action.unavailableReason)?.value
    ?? actionsByRecipient[initialRecipient]?.[0]?.value
    ?? initialAction;
  const isAssignmentSender = activeAssignmentCreatedByCurrentOffice;
  const isReturned = sub.status === 'returned';

  // ─── Office assignments (who was asked, and what they answered) ────────────
  const historicalRecipientView = hasOfficeAssignment
    && !isResponsibleOffice
    && !isRecipientOffice
    && !isAssignmentSender;
  const composerClosed = isChangesRequested || isCompleted || isRejected || isWithdrawn || isReturned || historicalRecipientView;
  const officeHistory = routeSteps
    .filter((step) => step.status !== 'skipped')
    .map((step) => ({
      id: step.id,
      officeRole: step.office_role,
      state: step.outcome
        ? describeAssignmentState(step).label
        : step.status === 'completed'
          ? 'Completed'
          : step.status === 'in_progress'
            ? 'Under review'
            : step.status === 'pending'
              ? 'Pending'
              : step.status.replaceAll('_', ' '),
      tone: step.outcome
        ? describeAssignmentState(step).tone
        : step.status === 'pending' || step.status === 'in_progress'
          ? 'waiting'
          : step.status === 'returned'
            ? 'caution'
            : step.status === 'withdrawn'
              ? 'muted'
              : 'muted',
      timestamp: step.completed_at ?? step.decided_at ?? step.started_at ?? step.assigned_at,
      comments: step.comments,
      sortTimestamp: step.completed_at ?? step.decided_at ?? step.started_at ?? step.assigned_at ?? '',
    }));
  if (isCompleted || isRejected) {
    // "Complete" (status completed) finishes processing without an approval decision.
    const isApprovalDecision = sub.status === 'approved';
    const finalDecisionAt = sub.final_decided_at
      ?? (isRejected ? sub.rejected_at : isApprovalDecision ? sub.approved_at : sub.completed_at)
      ?? sub.updated_at;
    const storedFinalDecisionOfficeRole = sub.final_decision_office_role ?? null;
    const finalDecisionOfficeRole = isOfficeRole(storedFinalDecisionOfficeRole)
      ? storedFinalDecisionOfficeRole
      : isOfficeRole(responsibleOfficeRole)
        ? responsibleOfficeRole
        : null;
    if (finalDecisionOfficeRole) {
      officeHistory.push({
        id: `final-decision-${sub.id}`,
        officeRole: finalDecisionOfficeRole,
        state: isRejected
          ? 'Final decision: Rejected'
          : isApprovalDecision
            ? 'Final decision: Approved'
            : 'Submission completed',
        tone: isRejected ? 'negative' : 'positive',
        timestamp: finalDecisionAt,
        comments: isRejected
          ? sub.rejection_comment ?? sub.office_comments ?? null
          : sub.closure_note ?? (isApprovalDecision ? sub.office_comments : null) ?? null,
        sortTimestamp: finalDecisionAt,
      });
    }
  }
  officeHistory.sort((first, second) =>
    first.sortTimestamp.localeCompare(second.sortTimestamp)
  );
  const latestOpenChangeRequest = [...(revisionHistory?.changeRequests ?? [])]
    .reverse()
    .find((request) => request.status === 'open') ?? null;
  const activeOfficeLabel = (step: RouteStep) => getOfficeLabel(step.office_role);
  const currentHandlingLabel = isChangesRequested
    ? 'Waiting for the requestee'
    : pendingAssignments.length > 0
      ? pendingAssignments.map(activeOfficeLabel).join(', ')
      : isCompleted || isRejected || isWithdrawn
        ? 'No active office assignment'
        : responsibleOfficeRole
          ? getOfficeLabel(responsibleOfficeRole)
          : 'Not assigned';

  const startOfficeReview = async () => {
    if (readOnly || !sub || !isOfficeRole(role) || !requiresReviewStart) return;
    setUpdating(true);
    setActionError('');
    try {
      const rpcName = isResponsibleOffice
        ? 'receive_workflow_submission'
        : 'receive_workflow_assignment';
      const { error } = await supabase.rpc(rpcName, { target_submission_id: sub.id });
      if (error) throw new Error(error.message || 'Could not start this review.');
      await fetchDetails();
    } catch (error) {
      logClientError('Could not start office review:', error);
      setActionError(error instanceof Error ? error.message : 'Could not start this review.');
    } finally {
      setUpdating(false);
    }
  };
  const downloadOriginal = async () => {
    const url = await getFileUrl(supabase, sub);
    await downloadFile(url, sub.file_name);
  };
  const previewingAttachment = attachments.find((attachment) => attachment.id === previewingAttachmentId);
  const submissionTitle = getWorkflowSubmissionTitle(
    sub.category ? getWorkflowDocumentTypeLabel(sub.category, sub.other_document_type) : null,
    sub.file_name
  );

  return (
    <div className="mx-auto w-full max-w-[1500px] pb-8">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => {
            if (readOnly) router.push('/workflow/admin/submissions');
            else if (isOfficeRole(role)) router.push(getOfficeFileManagementPath(role));
            else router.back();
          }}
          className="inline-flex items-center gap-2 text-xs font-semibold text-muted-text transition-colors hover:text-clay"
        >
          <span className="grid h-8 w-8 place-items-center rounded-full border border-warm-border bg-card">
            <Icon name="arrow-left" size={16} />
          </span>
          {readOnly ? 'Back to file registry' : 'Back to queue'}
        </button>
        <div className="rounded-xl border border-warm-border bg-white px-5 py-3.5 text-right">
          <Label>Tracking number</Label>
          <p className="font-mono text-sm font-bold tracking-[0.08em] text-clay">
            {sub.tracking_number || 'Pending'}
          </p>
        </div>
      </div>
      <section className="mb-5 rounded-2xl border border-warm-border bg-card p-5 shadow-[0_12px_35px_rgba(65,49,39,0.05)] md:p-7">
        <div className="mb-3 flex flex-wrap items-center gap-2.5">
          <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-bold ${statusConfig.classes}`}>
            <span className={`h-1.5 w-1.5 rounded-full bg-current ${isCompleted || isWithdrawn || sub.status === 'closed_by_submitter' ? 'opacity-70' : 'animate-pulse'}`} />
            {statusConfig.label}
          </span>
          {sub.reopen_count === 1 && (
            <span className="rounded-full bg-review-bg px-2.5 py-1 text-[10px] font-bold text-review-text">
              Resubmitted
            </span>
          )}
        </div>
        <h1 className={`${fonts.serif} max-w-4xl break-words text-2xl font-semibold leading-tight tracking-[-0.02em] text-warm-text md:text-3xl`}>
          {submissionTitle}
        </h1>
        <p className="mt-2 truncate text-[11px] text-muted-text" title={sub.file_name}>
          {sender?.full_name || 'Unknown requestee'}
          {sender?.email ? ` · ${sender.email}` : ''}
          {' · '}Submitted {new Date(sub.created_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
          {' · '}{sub.file_type || 'File'}
          {' · '}{sub.file_size ? `${(sub.file_size / 1024).toFixed(2)} KB` : 'Size unavailable'}
          {' · '}ID {String(sub.id).split('-')[0]}
          {isOfficeRole(selectedOfficeRole) ? ` · ${OFFICE_CONFIG[selectedOfficeRole].label}` : ''}
        </p>
      </section>

      {readOnly && (
        <p role="status" className="mb-5 rounded-xl border border-warm-border bg-card px-4 py-3 text-xs text-muted-text">
          Read-only view. Administrators can review this submission but cannot take workflow actions here.
        </p>
      )}
      {(actionError || loadError) && (
        <div role="alert" className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rejected-bg bg-rejected-bg/50 px-4 py-3 text-xs font-medium text-rejected-text">
          <span>{loadError || actionError}</span>
          {loadError && (
            <button
              type="button"
              onClick={() => {
                setLoading(true);
                void fetchDetails();
              }}
              className="rounded-full border border-current px-4 py-2 font-bold hover:bg-white/50"
            >
              Try again
            </button>
          )}
        </div>
      )}

      <section
        aria-labelledby={`next-step-${sub.id}`}
        className="mb-5 flex flex-col gap-4 rounded-2xl border border-clay bg-clay-soft p-5 lg:flex-row lg:items-start lg:justify-between"
      >
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-clay">Your next step</p>
          <h2 id={`next-step-${sub.id}`} className="mt-1 text-base font-bold text-warm-text">
            {readOnly
              ? 'Review this submission'
              : requiresReviewStart
                ? 'Start processing'
                : composerClosed
                  ? 'Review the workflow history'
                  : 'Choose an available action'}
          </h2>
          <p className="mt-1 max-w-3xl text-[11px] leading-relaxed text-muted-text">
            {readOnly
              ? 'This administrator view is read-only; workflow actions are not available here.'
              : requiresReviewStart
                ? isResponsibleOffice
                  ? 'Start processing to receive this submission and change its status to In Process.'
                  : 'Start your assigned review to enable the available office actions.'
                : composerClosed
                  ? 'This workflow step is closed. Review the conversation and activity for its history.'
                  : 'Review the available action options, then open the conversation panel to submit your decision.'}
          </p>
        </div>
        {(readOnly || requiresReviewStart) && (
          <div className="flex w-full min-w-0 flex-col items-start gap-2 lg:w-auto lg:items-end">
            {readOnly ? (
              <span className="text-[11px] font-semibold text-muted-text">Read-only access</span>
            ) : (
              <button
                type="button"
                onClick={() => void startOfficeReview()}
                disabled={updating || (!isResponsibleOffice && Boolean(routeStateError))}
                className="inline-flex h-10 items-center justify-center rounded-full bg-clay px-5 text-xs font-bold text-white transition-colors hover:bg-warm-text disabled:cursor-not-allowed disabled:opacity-50"
              >
                {updating ? 'Starting...' : 'Start processing'}
              </button>
            )}
          </div>
        )}
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-5">
      {/* ── Document ── */}
      <section className="overflow-hidden rounded-2xl border border-warm-border bg-card">
        <div className={`flex items-center gap-3 px-5 py-4 md:px-7 ${previewOpen ? 'border-b border-warm-border' : ''}`}>
          <button
            type="button"
            onClick={() => setPreviewOpen((open) => !open)}
            aria-expanded={previewOpen}
            aria-pressed={previewOpen}
            aria-controls={`document-preview-${sub.id}`}
            className="flex min-w-0 flex-1 items-center justify-between gap-4 text-left"
          >
            <span className="min-w-0">
              <span className="block text-[10px] font-bold uppercase tracking-[0.15em] text-clay">Document</span>
              <span className="mt-1 block truncate text-xs font-semibold text-warm-text">{sub.file_name}</span>
              <span className="mt-1 block text-[10px] font-medium text-muted-text">
                {previewOpen ? 'Hide full document preview' : 'Select to view the full document'}
              </span>
            </span>
            <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full border transition-colors transition-transform ${
              previewOpen
                ? 'rotate-90 border-clay bg-clay-soft text-clay'
                : 'border-warm-border text-muted-text'
            }`}>
              <Icon name="chevron-right" size={16} />
            </span>
          </button>
          <button
            type="button"
            onClick={downloadOriginal}
            aria-label={`Download ${sub.file_name}`}
            className="inline-flex h-9 shrink-0 items-center gap-2 rounded-full border border-warm-border px-3.5 text-[11px] font-bold text-warm-text hover:bg-sidebar"
          >
            <Icon name="download" size={15} />
            <span className="hidden sm:inline">Download</span>
          </button>
          {attachments.length > 0 && (
            <button
              type="button"
              onClick={() => setSupportingAttachmentsOpen((open) => !open)}
              aria-label={`${supportingAttachmentsOpen ? 'Hide' : 'Show'} ${attachments.length} supporting documents`}
              aria-expanded={supportingAttachmentsOpen}
              aria-controls={`supporting-attachments-${sub.id}`}
              title={`${attachments.length} supporting ${attachments.length === 1 ? 'document' : 'documents'}`}
              className={`relative grid h-9 w-9 shrink-0 place-items-center rounded-full border transition-colors ${
                supportingAttachmentsOpen
                  ? 'border-clay bg-clay-soft text-clay'
                  : 'border-warm-border text-warm-text hover:bg-sidebar'
              }`}
            >
              <Icon name="paperclip" size={16} />
              <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-clay px-1 text-[9px] font-bold leading-none text-white">
                {attachments.length}
              </span>
            </button>
          )}
        </div>
        <div className="px-5 pt-4 md:px-7">
          <DocumentDownloadWarning />
        </div>
        {attachments.length > 0 && (
          <div
            id={`supporting-attachments-${sub.id}`}
            hidden={!supportingAttachmentsOpen}
            className="border-b border-warm-border bg-sidebar/40 px-5 py-4 md:px-7"
          >
            <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-text">
              Supporting documents
            </p>
            <div className="flex flex-wrap gap-2">
              {attachments.map((attachment) => (
                <div
                  key={attachment.id}
                  className="flex min-w-0 items-center gap-2 rounded-xl border border-warm-border bg-card px-3 py-2 text-left text-warm-text transition-colors hover:border-clay"
                >
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-clay-soft text-clay">
                    <Icon name="file" size={14} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[11px] font-bold">{attachment.file_name}</span>
                    <span className="mt-0.5 block text-[9px] text-muted-text">
                      {Math.max(1, Math.round(attachment.file_size / 1024))} KB
                      {attachment.file_type ? ` · ${attachment.file_type.split('/').pop()?.toUpperCase()}` : ''}
                    </span>
                  </span>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setPreviewingAttachmentId((current) =>
                        current === attachment.id ? null : attachment.id
                      )}
                      aria-label={`${previewingAttachmentId === attachment.id ? 'Close preview of' : 'Preview'} ${attachment.file_name}`}
                      aria-pressed={previewingAttachmentId === attachment.id}
                      className={`grid h-8 w-8 place-items-center rounded-full transition-colors ${
                        previewingAttachmentId === attachment.id
                          ? 'bg-clay-soft text-clay'
                          : 'text-muted-text hover:bg-sidebar hover:text-warm-text'
                      }`}
                    >
                      <span className="text-sm" aria-hidden="true">⌕</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void downloadAttachment(attachment)}
                      aria-label={`Download ${attachment.file_name}`}
                      className="grid h-8 w-8 place-items-center rounded-full text-muted-text transition-colors hover:bg-sidebar hover:text-warm-text"
                    >
                      <Icon name="download" size={15} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            {previewingAttachment && (
              <section className="mt-4 overflow-hidden rounded-xl border border-warm-border bg-card">
                <header className="flex items-center justify-between gap-3 border-b border-warm-border px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-clay">Supporting document preview</p>
                    <h3 className="mt-1 truncate text-xs font-semibold text-warm-text">{previewingAttachment.file_name}</h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPreviewingAttachmentId(null)}
                    aria-label="Close supporting document preview"
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-warm-border text-muted-text hover:bg-sidebar"
                  >
                    <span aria-hidden="true">×</span>
                  </button>
                </header>
                <div className="relative flex h-[min(65vh,680px)] min-h-[360px] items-center justify-center overflow-auto bg-[#eae5df] p-4 md:p-6">
                  <FilePreview
                    file={{
                      file_name: previewingAttachment.file_name,
                      file_url: '',
                      file_path: previewingAttachment.file_path,
                      file_type: previewingAttachment.file_type,
                    }}
                    warnOnDownload
                  />
                </div>
              </section>
            )}
          </div>
        )}
          <div id={`document-preview-${sub.id}`} hidden={!previewOpen}>
            {previewOpen && (
              <div className="relative flex h-[min(70vh,760px)] min-h-[540px] items-center justify-center overflow-auto bg-[#eae5df] p-5 md:p-8 max-lg:h-[min(65vh,480px)] max-lg:min-h-[min(65vh,360px)]">
                <FilePreview file={sub} warnOnDownload />
              </div>
            )}
          </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-warm-border bg-card">
        <div
          role="tablist"
          aria-label="Submission detail sections"
          aria-orientation="horizontal"
          onKeyDown={(event) => {
            if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
            event.preventDefault();
            const tabs = ['conversation', 'activity', 'versions'] as const;
            const currentIndex = tabs.indexOf(activeDetailTab);
            const offset = event.key === 'ArrowRight' ? 1 : -1;
            const nextTab = tabs[(currentIndex + offset + tabs.length) % tabs.length];
            setActiveDetailTab(nextTab);
            document.getElementById(`detail-tab-${sub.id}-${nextTab}`)?.focus();
          }}
          className="flex overflow-x-auto border-b border-warm-border px-3"
        >
          <button
            type="button"
            role="tab"
            id={`detail-tab-${sub.id}-conversation`}
            aria-selected={activeDetailTab === 'conversation'}
            aria-controls={`detail-panel-${sub.id}-conversation`}
            tabIndex={activeDetailTab === 'conversation' ? 0 : -1}
            onClick={() => setActiveDetailTab('conversation')}
            className={`shrink-0 border-b-2 px-4 py-3 text-xs font-bold transition-colors ${
              activeDetailTab === 'conversation' ? 'border-clay text-clay' : 'border-transparent text-muted-text hover:text-warm-text'
            }`}
          >
            Conversation
          </button>
          <button
            type="button"
            role="tab"
            id={`detail-tab-${sub.id}-activity`}
            aria-selected={activeDetailTab === 'activity'}
            aria-controls={`detail-panel-${sub.id}-activity`}
            tabIndex={activeDetailTab === 'activity' ? 0 : -1}
            onClick={() => setActiveDetailTab('activity')}
            className={`shrink-0 border-b-2 px-4 py-3 text-xs font-bold transition-colors ${
              activeDetailTab === 'activity' ? 'border-clay text-clay' : 'border-transparent text-muted-text hover:text-warm-text'
            }`}
          >
            Activity
          </button>
          <button
            type="button"
            role="tab"
            id={`detail-tab-${sub.id}-versions`}
            aria-selected={activeDetailTab === 'versions'}
            aria-controls={`detail-panel-${sub.id}-versions`}
            tabIndex={activeDetailTab === 'versions' ? 0 : -1}
            onClick={() => setActiveDetailTab('versions')}
            className={`shrink-0 border-b-2 px-4 py-3 text-xs font-bold transition-colors ${
              activeDetailTab === 'versions' ? 'border-clay text-clay' : 'border-transparent text-muted-text hover:text-warm-text'
            }`}
          >
            File versions
          </button>
        </div>

        <div
          id={`detail-panel-${sub.id}-conversation`}
          role="tabpanel"
          aria-labelledby={`detail-tab-${sub.id}-conversation`}
          tabIndex={0}
          hidden={activeDetailTab !== 'conversation'}
          className="p-4 md:p-5"
        >
          {officeReview ? (
            <div className="[&>section>div]:grid-cols-1 [&>section>div>aside]:hidden">
              <DocumentMessaging
                key={sub.id}
                submissionId={sub.id}
                fileName={sub.file_name}
                trackingNumber={sub.tracking_number ?? null}
                readOnly={readOnly}
                assignmentConversations={assignmentConversations}
                defaultAssignmentStepId={defaultAssignmentStepId}
                showSubmitterConversation={readOnly || isResponsibleOffice}
                canSendSubmitterConversation={!requiresReviewStart && !isChangesRequested && !isCompleted && !isRejected && !isWithdrawn && !isReturned && isResponsibleOffice}
                workflowComposer={{
                  recipients,
                  actionsByRecipient,
                  initialRecipient,
                  initialAction,
                  contextNote: isRecipientOffice
                    ? 'Your office is supporting this request. Completing an assignment only closes your assignment; recommendations go to the responsible office, which makes the final decision.'
                    : 'Your office owns this request. Approve or Reject records the final decision; Complete request finishes processing without recording approval or rejection.',
                  statusLine,
                  showStatusLine: false,
                  isClosed: composerClosed,
                  startReviewMessage: isResponsibleOffice
                    ? 'Start processing to receive this submission and change its status to In Process.'
                    : 'The submission is already In Process, but your office assignment is still pending. Start processing here to enable its action options.',
                  startReviewDisabled: !isResponsibleOffice && Boolean(routeStateError),
                  isOfficeWorkspace: true,
                  activeAssignmentStepId: activeRouteStep?.id ?? null,
                  showWorkflowActions: !readOnly && (isResponsibleOffice || isRecipientOffice) && !requiresReviewStart,
                  actionSectionId: `office-workflow-action-${sub.id}`,
                  closedMessage: isChangesRequested
                    ? 'This submission is closed while changes are requested. Offices may review the history but cannot act or send messages.'
                    : requiresReviewStart
                    ? 'Start processing when your office is ready to begin.'
                    : historicalRecipientView
                    ? 'This assignment is no longer active. You can still review its files and messages.'
                    : isRejected
                      ? 'This submission was rejected.'
                      : isWithdrawn
                      ? 'This submission is withdrawn.'
                      : isReturned
                      ? 'This submission was returned to the requestee for redirection.'
                      : 'This submission is completed.',
                  busy: updating,
                  pendingAssignmentCount,
                  sourceDocument: {
                    filePath: sub.file_path ?? null,
                    fileType: sub.file_type,
                    fileSize: sub.file_size,
                  },
                  onWorkflowAction: handleWorkflowAction,
                  onForwarded: async () => {
                    await fetchDetails();
                  },
                }}
                activity={null}
              />
            </div>
          ) : (
            <div className="flex min-h-64 items-center justify-center rounded-2xl border border-warm-border bg-card p-6 text-center text-xs text-muted-text">
              This submission is not assigned to your office.
            </div>
          )}
        </div>

        <div
          id={`detail-panel-${sub.id}-activity`}
          role="tabpanel"
          aria-labelledby={`detail-tab-${sub.id}-activity`}
          tabIndex={0}
          hidden={activeDetailTab !== 'activity'}
          className="p-4 md:p-5"
        >
          <WorkflowActivityTimeline
            events={auditLogs.map((log) => ({
              id: log.id,
              actionType: log.action_type,
              label: getActionLabel(log.action_type),
              createdAt: log.created_at,
              actor: log.profiles?.full_name || 'System',
              actorRole: getActorRoleLabel(log.profiles?.role),
              comments: log.comments,
            }))}
          />
        </div>

        <div
          id={`detail-panel-${sub.id}-versions`}
          role="tabpanel"
          aria-labelledby={`detail-tab-${sub.id}-versions`}
          tabIndex={0}
          hidden={activeDetailTab !== 'versions'}
          className="p-4 md:p-5"
        >
          <WorkflowRevisionTimeline
            history={revisionHistory}
            loading={revisionHistoryLoading}
            error={revisionHistoryError}
            isOfficeWorkspace={isOfficeRole(role) && !readOnly}
          />
        </div>
      </section>
        </div>

        <aside className="space-y-5 lg:sticky lg:top-4 lg:self-start">
          <section
            aria-labelledby={`workflow-status-${sub.id}`}
            className="overflow-hidden rounded-2xl border border-warm-border bg-card"
            role="status"
          >
            <header className="border-b border-warm-border px-5 py-4">
              <h2 id={`workflow-status-${sub.id}`} className="text-sm font-bold text-warm-text">At a glance</h2>
              <p className="mt-0.5 text-[10px] text-muted-text">Responsibility, active handling, and what is needed next</p>
            </header>
            <div className="space-y-4 p-5">
              <div>
                <Label>Responsible office</Label>
                <p className="text-xs font-semibold text-warm-text">
                  {responsibleOfficeRole ? getOfficeLabel(responsibleOfficeRole) : 'Not assigned'}
                </p>
              </div>
              <div>
                <Label>Handling now</Label>
                <p className="text-xs font-semibold text-warm-text">
                  {isChangesRequested ? 'Processing paused' : currentHandlingLabel}
                </p>
              </div>
              <div>
                <Label>Waiting on</Label>
                <p className="text-xs font-semibold text-warm-text">
                  {isChangesRequested
                    ? 'Requestee response'
                    : pendingAssignments.length > 0
                      ? pendingAssignments.map(activeOfficeLabel).join(', ')
                      : isCompleted || isRejected || isWithdrawn
                        ? 'No further action'
                        : responsibleOfficeRole
                          ? getOfficeLabel(responsibleOfficeRole)
                          : 'Not assigned'}
                </p>
              </div>
              {isChangesRequested && (
                <div className="rounded-xl border border-pending-text/20 bg-pending-bg/50 p-3">
                  <p className="text-[10px] font-bold text-pending-text">Latest request note</p>
                  <p className="mt-1 whitespace-pre-wrap break-words text-[11px] leading-relaxed text-warm-text">
                    {latestOpenChangeRequest?.message || sub.office_comments || 'No additional note was provided.'}
                  </p>
                </div>
              )}
            </div>
          </section>

          <section className="overflow-hidden rounded-2xl border border-warm-border bg-card">
            <header className="border-b border-warm-border px-5 py-4">
              <h2 className="text-sm font-bold text-warm-text">Office route</h2>
              <p className="mt-0.5 text-[10px] text-muted-text">Assignment activity for this submission</p>
            </header>
            <div className="max-h-80 overflow-y-auto p-4">
              {officeHistory.length === 0 ? (
                <p className="rounded-xl bg-sidebar/60 px-4 py-3 text-[11px] text-muted-text">
                  No office route has been recorded yet.
                </p>
              ) : (
                <ol className="space-y-2">
                  {officeHistory.map((entry) => (
                    <li key={entry.id} className="rounded-xl border border-warm-border bg-sidebar/40 p-3">
                      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                        <div className="min-w-0">
                          <p className="text-[11px] font-semibold text-warm-text">{getOfficeLabel(entry.officeRole)}</p>
                          <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${ASSIGNMENT_TONE_CLASSES[entry.tone]}`}>
                            {entry.state}
                          </span>
                        </div>
                        {entry.timestamp && (
                          <time dateTime={entry.timestamp} className="shrink-0 text-[9px] text-muted-text">
                            {new Date(entry.timestamp).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                          </time>
                        )}
                      </div>
                      {entry.comments && (
                        <p className="mt-2 whitespace-pre-wrap break-words text-[10px] leading-relaxed text-muted-text">
                          {entry.comments}
                        </p>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}