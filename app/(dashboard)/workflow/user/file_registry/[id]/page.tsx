'use client';
import { logClientError } from '@/lib/clientLogger';

import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { useParams, useRouter } from 'next/navigation';
import QRCode from 'qrcode';
import { createClient } from '@/lib/supabase/client';
import DocumentMessaging from '@/components/DocumentMessaging';
import WorkflowActivityTimeline from '@/components/WorkflowActivityTimeline';
import WorkflowRevisionTimeline from '@/components/WorkflowRevisionTimeline';
import WorkflowStatusPanel, { type WorkflowStatusStep } from '@/components/WorkflowStatusPanel';
import FilePreview, { downloadFile, getFileUrl } from '@/components/FilePreview';
import {
  getWorkflowFileMimeType,
  getWorkflowFilesTypeError,
  WORKFLOW_ATTACHMENT_ACCEPT,
  WORKFLOW_DOCUMENT_ACCEPT,
} from '@/lib/workflow/file-types';
import { getAvailableActions } from '@/lib/workflow/action-availability';
import {
  type WorkflowRevisionFile,
  type WorkflowRevisionHistory,
  type WorkflowRevisionManifestItem,
} from '@/lib/workflow/revisions';
import { loadWorkflowSubmissionDetail } from '@/lib/workflow/submission-detail';
import { useSubmissionDetailRealtime } from '@/lib/workflow/useSubmissionDetailRealtime';
import {
  getWorkflowDocumentTypeLabel,
  isOfficeRole,
  OFFICE_CONFIG,
  type OfficeRole,
} from '@/lib/workflow/offices';
import { getSubmissionStatusLabel, getSubmissionStatusTone } from '@/lib/workflow/status';
import { useWorkflowAccount } from '@/lib/workflow/role-context';

const fonts = {
  serif: 'font-serif',
};

interface Submission {
  id: string;
  user_id: string;
  tracking_number: string | null;
  file_name: string;
  file_url: string;
  file_path?: string | null;
  file_type: string;
  file_size: number;
  status: string;
  current_revision_id?: string | null;
  reopen_count?: number | null;
  category: string | null;
  other_document_type?: string | null;
  description: string | null;
  intended_recipient?: string | null;
  initial_destination_role?: string | null;
  selected_office_role?: string | null;
  closed_by?: string | null;
  closure_note?: string | null;
  closure_file_path?: string | null;
  closure_file_name?: string | null;
  closure_file_type?: string | null;
  closure_file_size?: number | null;
  final_decided_at?: string | null;
  final_decision_office_role?: string | null;
  approved_at?: string | null;
  rejected_at?: string | null;
  office_comments?: string | null;
  mayor_comments?: string | null;
  sender_response?: string | null;
  approver_comments: string | null;
  admin_comments: string | null;
  rejection_comment: string | null;
  created_at: string;
  received_at?: string | null;
  completed_at?: string | null;
}

interface Attachment {
  id: string;
  file_name: string;
  file_path: string;
  file_type: string | null;
  file_size: number;
}

interface AuditLog {
  id: string;
  action_type: string;
  old_status: string | null;
  new_status: string | null;
  comments: string | null;
  created_at: string;
  profiles?: { full_name: string | null; role: string | null } | { full_name: string | null; role: string | null }[] | null;
}

interface RetrievalQr {
  retrieval_token: string;
  expires_at: string;
  retrieval_status: string;
}

type RevisionFileAction = 'keep' | 'replace' | 'remove';

interface RevisionDraftFile {
  file: WorkflowRevisionFile;
  action: RevisionFileAction;
  replacement: File | null;
}

interface UploadedRevisionFile {
  fileName: string;
  filePath: string;
  fileType: string;
  fileSize: number;
}

const MAX_REVISION_FILE_SIZE = 10 * 1024 * 1024;

const getRevisionFileError = (files: File[], allowZip = true): string | null => {
  const typeError = getWorkflowFilesTypeError(files, allowZip);
  if (typeError) return typeError;
  const invalidName = files.find((file) => file.name.trim().length === 0 || file.name.length > 255);
  if (invalidName) return `"${invalidName.name}" must have a file name between 1 and 255 characters.`;
  const invalidFile = files.find((file) => file.size <= 0 || file.size > MAX_REVISION_FILE_SIZE);
  if (!invalidFile) return null;
  return `"${invalidFile.name}" must be larger than 0 bytes and no larger than 10 MB.`;
};

const getErrorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error ? error.message : fallback;

export default function UserFileDetail() {
  const { id } = useParams();
  const router = useRouter();
  const [sub, setSub] = useState<Submission | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [revisionHistory, setRevisionHistory] = useState<WorkflowRevisionHistory | null>(null);
  const [revisionHistoryLoading, setRevisionHistoryLoading] = useState(true);
  const [revisionHistoryError, setRevisionHistoryError] = useState<string | null>(null);
  const [routeSteps, setRouteSteps] = useState<WorkflowStatusStep[]>([]);
  const [currentRoutePlanId, setCurrentRoutePlanId] = useState<string | null>(null);
  const [routePlanIds, setRoutePlanIds] = useState<string[]>([]);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');
  const [revisionEditorOpen, setRevisionEditorOpen] = useState(false);
  const [revisionDraftFiles, setRevisionDraftFiles] = useState<RevisionDraftFile[]>([]);
  const [revisionAddedFiles, setRevisionAddedFiles] = useState<File[]>([]);
  const [revisionMessage, setRevisionMessage] = useState('');
  const [submittingRevision, setSubmittingRevision] = useState(false);
  const [closingPermanently, setClosingPermanently] = useState(false);
  const [closureActor, setClosureActor] = useState<string | null>(null);
  const [redirectOffice, setRedirectOffice] = useState<OfficeRole | ''>('');
  const [redirectDocumentType, setRedirectDocumentType] = useState('');
  const [redirectOtherDocumentType, setRedirectOtherDocumentType] = useState('');
  const [savingRedirect, setSavingRedirect] = useState(false);
  const [retrievalQr, setRetrievalQr] = useState<RetrievalQr | null>(null);
  const [qrImage, setQrImage] = useState('');
  const [qrLoading, setQrLoading] = useState(false);
  const [qrError, setQrError] = useState('');
  const [qrOriginWarning, setQrOriginWarning] = useState('');
  const [loading, setLoading] = useState(true);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [supportingAttachmentsOpen, setSupportingAttachmentsOpen] = useState(false);
  const [previewingAttachmentId, setPreviewingAttachmentId] = useState<string | null>(null);
  const supabase = useMemo(() => createClient(), []);
  const { userId: accountUserId } = useWorkflowAccount();

  const fetchSubmission = useCallback(async (preserveCurrent = false) => {
    if (!preserveCurrent) {
      setLoading(true);
      setSub(null);
      setAttachments([]);
      setRevisionHistory(null);
      setRouteSteps([]);
      setCurrentRoutePlanId(null);
      setRoutePlanIds([]);
      setRouteError(null);
    }
    setRevisionHistoryLoading(true);
    setRevisionHistoryError(null);
    setRetrievalQr(null);
    setQrImage('');
    setQrError('');
    try {
      if (typeof id !== 'string') throw new Error('Could not determine which submission to load.');
      const detail = await loadWorkflowSubmissionDetail(supabase, id);
      const data = detail.submission;
      setSub(data);
      setClosureActor(detail.closureActor?.full_name ?? null);
      setAuditLogs(detail.activityLogs);
      setRouteSteps(detail.routeSteps);
      setRoutePlanIds(detail.routePlanIds);
      setCurrentRoutePlanId(detail.currentRoute?.id ?? null);
      setRouteError(null);
      setRevisionHistory(detail.revisionHistory);
      setAttachments(detail.supportingFiles);

      if (data.status === 'completed' || data.status === 'approved') {
        const { data: qrData, error: qrLoadError } = await supabase.rpc(
          'get_workflow_retrieval_qr',
          { target_submission_id: id },
        );
        if (qrLoadError) {
          logClientError('Retrieval QR load failed:', qrLoadError.message);
          setQrError('We couldn’t load your pickup QR code. Refresh the page and try again.');
        } else {
          const existingQr = Array.isArray(qrData) ? qrData[0] : qrData;
          setRetrievalQr(existingQr ?? null);
          setQrError('');
        }
      } else {
        setRetrievalQr(null);
        setQrError('');
      }
    } catch (error) {
      logClientError('Submission detail load failed:', error);
      const message = 'We couldn’t load your request. Refresh the page to try again.';
      setRevisionHistoryError('We couldn’t load your version history. Refresh the page to try again.');
      setRouteError('We couldn’t load the latest office updates. Refresh the page to try again.');
      if (preserveCurrent) {
        setActionError('Your update was saved, but this page could not refresh. Reload to see the latest status.');
      } else {
        setActionError(message);
      }
    } finally {
      setLoading(false);
      setRevisionHistoryLoading(false);
    }
  }, [id, supabase]);

  useEffect(() => {
    void fetchSubmission();
  }, [fetchSubmission]);

  const refreshSubmissionDetail = useCallback(() => {
    void fetchSubmission(true);
  }, [fetchSubmission]);

  useSubmissionDetailRealtime(
    supabase,
    typeof id === 'string' ? id : null,
    routePlanIds,
    refreshSubmissionDetail,
  );

  useEffect(() => {
    let active = true;
    if (!retrievalQr || !['active', 'released'].includes(retrievalQr.retrieval_status)) {
      setQrImage('');
      return;
    }

    const appOrigin = process.env.NEXT_PUBLIC_APP_URL?.trim() || window.location.origin;
    let retrievalUrl: URL;
    try {
      retrievalUrl = new URL('/workflow/retrieval', appOrigin);
      if (!['http:', 'https:'].includes(retrievalUrl.protocol)) {
        throw new Error('The application URL must use HTTP or HTTPS.');
      }
    } catch (error) {
      logClientError('Retrieval QR application URL is invalid:', error);
      if (active) setQrError('The pickup QR code could not be created because the app address is not set up correctly. Please contact support.');
      return () => {
        active = false;
      };
    }

    const hostname = retrievalUrl.hostname.toLowerCase();
    const isLocalHost = hostname === 'localhost'
      || hostname === '127.0.0.1'
      || hostname === '0.0.0.0'
      || hostname === '::1';
    if (active) {
      setQrOriginWarning(isLocalHost
        ? 'This QR code only works on this computer. Please contact support so it can be set up for staff to use.'
        : '');
    }
    retrievalUrl.hash = new URLSearchParams({ token: retrievalQr.retrieval_token }).toString();

    QRCode.toDataURL(retrievalUrl.toString(), {
      errorCorrectionLevel: 'M',
      margin: 4,
      width: 420,
    }).then((dataUrl) => {
      if (active) setQrImage(dataUrl);
    }).catch((error: unknown) => {
      logClientError('Retrieval QR rendering failed:', error);
      if (active) setQrError('Could not render the QR code. Please try again.');
    });

    return () => {
      active = false;
    };
  }, [retrievalQr]);

  const generateRetrievalQr = async () => {
    if (!sub) return;
    setQrLoading(true);
    setQrError('');
    try {
      const { data, error } = await supabase.rpc('create_workflow_retrieval_qr', {
        target_submission_id: sub.id,
      });
      if (error) throw error;

      const createdQr = Array.isArray(data) ? data[0] : data;
      if (!createdQr?.retrieval_token || !createdQr?.expires_at) {
        throw new Error('The system did not return a valid retrieval QR code.');
      }
      setRetrievalQr(createdQr);
    } catch (error) {
      logClientError('Retrieval QR generation failed:', error);
      setQrError(error instanceof Error ? error.message : 'We couldn’t create your pickup QR code. Please refresh the page and try again.');
    } finally {
      setQrLoading(false);
    }
  };

  const downloadRetrievalQr = () => {
    if (!qrImage || !sub) return;
    const link = document.createElement('a');
    link.href = qrImage;
    link.download = `${sub.tracking_number || 'request'}-retrieval-qr.png`;
    link.click();
  };

  const redirectReturnedSubmission = async () => {
    if (!sub || !isOfficeRole(redirectOffice) || !redirectDocumentType) throw new Error('Choose an office and document type.');
    if (redirectDocumentType === 'Other' && !redirectOtherDocumentType.trim()) {
      throw new Error('Enter the custom document type.');
    }

    setSavingRedirect(true);
    setActionError('');
    try {
      const { error } = await supabase.rpc('redirect_workflow_submission', {
        target_submission_id: sub.id,
        target_office_role: redirectOffice,
        new_document_type: redirectDocumentType,
        new_other_document_type: redirectDocumentType === 'Other'
          ? redirectOtherDocumentType.trim()
          : null,
      });
      if (error) throw error;
      setRedirectOffice('');
      setRedirectDocumentType('');
      setRedirectOtherDocumentType('');
      await fetchSubmission(true);
    } catch (error) {
      logClientError('Submission redirect failed:', error);
      throw error instanceof Error ? error : new Error('Could not send your request to the selected office.');
    } finally {
      setSavingRedirect(false);
    }
  };

  const handleRedirectSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setActionError('');
    try {
      await redirectReturnedSubmission();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Could not send your request to the selected office.');
    }
  };

  const startRevision = () => {
    if (!sub || !revisionHistory || !sub.current_revision_id) {
      setActionError('We couldn’t verify your current files. Refresh the page before updating them.');
      return;
    }
    if (revisionHistory.changeRequestRepairNeeded) {
      setActionError('Staff need to review this change request before you can update your files.');
      return;
    }
    const openRequest = revisionHistory.changeRequests.find((request) =>
      request.status === 'open' && request.againstRevisionId === sub.current_revision_id
    );
    const currentRevision = revisionHistory.revisions.find(
      (revision) => revision.id === sub.current_revision_id,
    );
    if (!openRequest || !currentRevision) {
      setActionError('We couldn’t verify the change request or your current files. Refresh the page and try again.');
      return;
    }

    setRevisionDraftFiles(
      currentRevision.files
        .filter((file) => file.changeKind !== 'removed')
        .map((file) => ({ file, action: 'keep' as const, replacement: null })),
    );
    setRevisionAddedFiles([]);
    setRevisionMessage('');
    setActionError('');
    setRevisionEditorOpen(true);
  };

  const handleRevisionReplacement = (index: number, event: ChangeEvent<HTMLInputElement>) => {
    const replacement = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!replacement) return;
    const draft = revisionDraftFiles[index];
    if (!draft) return;
    const fileError = getRevisionFileError([replacement], draft.file.fileRole === 'supporting');
    if (fileError) {
      setActionError(fileError);
      return;
    }
    setActionError('');
    setRevisionDraftFiles((current) => current.map((entry, entryIndex) =>
      entryIndex === index
        ? { ...entry, action: 'replace', replacement }
        : entry
    ));
  };

  const handleRevisionAddedFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const selectedFiles = Array.from(input.files ?? []);
    input.value = '';
    if (selectedFiles.length === 0) return;
    const fileError = getRevisionFileError(selectedFiles);
    if (fileError) {
      setActionError(fileError);
      return;
    }
    setActionError('');
    setRevisionAddedFiles((current) => [...current, ...selectedFiles]);
  };

  const submitRevision = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!sub || !revisionHistory || !sub.current_revision_id || submittingRevision) return;
    setActionError('');

    const openRequest = revisionHistory.changeRequests.find((request) =>
      request.status === 'open' && request.againstRevisionId === sub.current_revision_id
    );
    if (!openRequest || revisionHistory.changeRequestRepairNeeded) {
      setActionError('We couldn’t verify the change request. Refresh the page and try again.');
      return;
    }

    if (revisionDraftFiles.some((entry) => entry.action === 'replace' && !entry.replacement)) {
      setActionError('Choose a replacement file for each file you marked “Replace”.');
      return;
    }
    const replacedFiles = revisionDraftFiles.filter(
      (entry): entry is RevisionDraftFile & { replacement: File } =>
        entry.action === 'replace' && entry.replacement !== null,
    );
    if (replacedFiles.length + revisionAddedFiles.length === 0) {
      setActionError('Add or replace at least one file to resubmit. Removing files alone will not reopen your request.');
      return;
    }
    const activePrimaryCount = revisionDraftFiles.filter(
      (entry) => entry.file.fileRole === 'primary' && entry.action !== 'remove',
    ).length;
    if (activePrimaryCount !== 1) {
      setActionError('Keep exactly one main document, or replace it with a new one.');
      return;
    }

    const uploadedPaths: string[] = [];
    setSubmittingRevision(true);
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!authData.user || authData.user.id !== sub.user_id) {
        throw new Error('Your active requestee account could not be verified.');
      }

      const uploadPlan = [
        ...replacedFiles.map((entry) => ({
          key: `replace-${entry.file.id}`,
          file: entry.replacement,
        })),
        ...revisionAddedFiles.map((file, index) => ({ key: `added-${index}`, file })),
      ];
      const uploadedFiles = new Map<string, UploadedRevisionFile>();
      const uploadResults = await Promise.allSettled(uploadPlan.map(async ({ key, file }, index) => {
        const fileType = getWorkflowFileMimeType(file.name);
        if (!fileType) throw new Error(`Unsupported file type: ${file.name}`);
        const safeName = file.name.replace(/[^\w.-]/g, '_');
        const filePath = `${accountUserId}/${crypto.randomUUID()}-${index}-${safeName}`;
        const { error } = await supabase.storage
          .from('workflow_uploads')
          .upload(filePath, file, {
            contentType: fileType,
            cacheControl: '3600',
            upsert: false,
          });
        if (error) throw error;
        uploadedPaths.push(filePath);
        uploadedFiles.set(key, {
          fileName: file.name,
          filePath,
          fileType,
          fileSize: file.size,
        });
      }));
      const failedUpload = uploadResults.find(
        (result): result is PromiseRejectedResult => result.status === 'rejected',
      );
      if (failedUpload) throw failedUpload.reason;

      const fileManifest: WorkflowRevisionManifestItem[] = revisionDraftFiles.map((entry) => {
        const base = {
          logical_file_id: entry.file.logicalFileId,
          prior_revision_file_id: entry.file.id,
          file_role: entry.file.fileRole,
        };
        if (entry.action === 'remove') {
          return {
            ...base,
            file_name: entry.file.fileName,
            storage_path: entry.file.storagePath,
            file_type: entry.file.fileType,
            file_size: entry.file.fileSize,
            change_kind: 'removed',
          };
        }
        if (entry.action === 'replace') {
          const uploaded = uploadedFiles.get(`replace-${entry.file.id}`);
          if (!uploaded) throw new Error(`The replacement upload for ${entry.file.fileName} is missing.`);
          return {
            ...base,
            file_name: uploaded.fileName,
            storage_path: uploaded.filePath,
            file_type: uploaded.fileType,
            file_size: uploaded.fileSize,
            change_kind: 'replaced',
          };
        }
        return {
          ...base,
          file_name: entry.file.fileName,
          storage_path: entry.file.storagePath,
          file_type: entry.file.fileType,
          file_size: entry.file.fileSize,
          change_kind: 'carried',
        };
      });

      revisionAddedFiles.forEach((file, index) => {
        const uploaded = uploadedFiles.get(`added-${index}`);
        if (!uploaded) throw new Error(`The added upload for ${file.name} is missing.`);
        fileManifest.push({
          logical_file_id: crypto.randomUUID(),
          prior_revision_file_id: null,
          file_role: 'supporting',
          file_name: uploaded.fileName,
          storage_path: uploaded.filePath,
          file_type: uploaded.fileType,
          file_size: uploaded.fileSize,
          change_kind: 'added',
        });
      });

      const { error: submitError } = await supabase.rpc('submit_workflow_submission_revision', {
        target_submission_id: sub.id,
        expected_change_request_id: openRequest.id,
        expected_revision_id: sub.current_revision_id,
        submitter_message: revisionMessage.trim() || null,
        file_manifest: fileManifest,
      });
      if (submitError) throw submitError;

      uploadedPaths.length = 0;
      setRevisionEditorOpen(false);
      setRevisionDraftFiles([]);
      setRevisionAddedFiles([]);
      await fetchSubmission(true);
    } catch (error) {
      logClientError('Submission revision failed:', error);
      let cleanupFailed = false;
      if (uploadedPaths.length > 0) {
        try {
          const { error: cleanupError } = await supabase.storage
            .from('workflow_uploads')
            .remove(uploadedPaths);
          if (cleanupError) throw cleanupError;
        } catch (cleanupError) {
          cleanupFailed = true;
          logClientError('Could not clean up uncommitted revision uploads:', cleanupError);
        }
      }
      const message = getErrorMessage(error, 'Could not submit this revision.');
      setActionError(cleanupFailed
        ? `${message} Some uncommitted uploads could not be removed; contact support if they remain visible.`
        : message);
    } finally {
      setSubmittingRevision(false);
    }
  };

  const closePermanently = async () => {
    if (!sub || !revisionHistory || closingPermanently) return;
    const openRequest = revisionHistory.changeRequests.find((request) =>
      request.status === 'open' && request.againstRevisionId === sub.current_revision_id
    );
    if (!openRequest || revisionHistory.changeRequestRepairNeeded) {
      setActionError('The open change request could not be verified. Refresh and try again.');
      return;
    }
    if (!window.confirm('Close this request permanently? You will not be able to reopen it. Your files and history will still be available.')) {
      return;
    }

    setClosingPermanently(true);
    setActionError('');
    try {
      const { error } = await supabase.rpc('close_workflow_submission_permanently', {
        target_submission_id: sub.id,
        expected_change_request_id: openRequest.id,
      });
      if (error) throw error;
      setRevisionEditorOpen(false);
      await fetchSubmission(true);
    } catch (error) {
      logClientError('Permanent submission closure failed:', error);
      setActionError(getErrorMessage(error, 'Could not permanently close your request.'));
    } finally {
      setClosingPermanently(false);
    }
  };

  const getStatusStyles = (status: string) => {
    const tone = getSubmissionStatusTone(status);
    const normalizedStatus = status.toLowerCase();
    const statusLabels: Record<string, string> = {
      in_process: 'Being processed',
      pending_office: 'Being processed',
      pending_mayor: 'Being processed',
      changes_requested: 'Changes requested',
      returned_for_requirements: 'Changes requested',
      returned: 'Choose a new office',
      completed: 'Processing complete',
      closed_by_submitter: 'Permanently closed by you',
    };
    const classes = tone === 'completed'
      ? 'bg-approved-bg text-approved-text'
      : tone === 'progress'
        ? 'bg-review-bg text-review-text'
        : tone === 'returned' || tone === 'pending'
          ? 'bg-pending-bg text-pending-text'
          : tone === 'withdrawn'
            ? 'bg-sidebar text-muted-text'
            : 'bg-sidebar text-muted-text';
    return { label: statusLabels[normalizedStatus] ?? getSubmissionStatusLabel(status), classes };
  };

  const getWorkflowActionLabel = (actionType: string) => {
    switch (actionType) {
      case 'DESTINATION_SELECTED': return 'You chose a destination office';
      case 'SUBMITTED': return 'Request submitted';
      case 'SUBMISSION_REDIRECTED': return 'Request sent to a different office';
      case 'SUBMISSION_RECEIVED': return 'Received by the office handling your request';
      case 'SUBMISSION_FORWARDED': return 'Another office was asked to review';
      case 'ASSIGNMENT_COMPLETED': return 'Additional office responded';
      case 'ASSIGNMENT_RETURNED': return 'Additional office returned the request';
      case 'ASSIGNMENT_WITHDRAWN': return 'Office assignment canceled';
      case 'CHANGES_REQUESTED': return 'Changes requested';
      case 'CHANGES_RESPONDED': return 'You responded to the change request';
      case 'RETURNED_TO_SUBMITTER': return 'Returned to you to choose a different office';
      case 'SUBMISSION_WITHDRAWN': return 'Request withdrawn';
      case 'SUBMISSION_CLOSED': return 'Request marked complete';
      case 'SUBMISSION_REOPENED': return 'Request reopened';
      case 'SUBMISSION_PERMANENTLY_CLOSED': return 'You permanently closed the request';
      case 'FILE_VERSION_ADDED': return 'Document updated';
      case 'ROUTE_PROPOSED': return 'Tourism Officer suggested offices to review';
      case 'OFFICE_ROUTE_STEP_ASSIGNED': return 'Request sent to a municipal office';
      case 'OFFICE_ROUTE_STEP_APPROVED': return 'Municipal office approved this step';
      case 'OFFICE_ASSIGNMENT_COMPLETED': return 'Municipal office completed its review';
      case 'OFFICE_ASSIGNMENT_FORWARDED': return 'Another office was asked to make a recommendation';
      case 'OFFICE_FORWARDED_TO_TOURISM_OFFICER': return 'Sent to the Tourism Officer for review';
      case 'TOURISM_OFFICER_ASSIGNMENTS_CREATED': return 'Tourism Officer asked additional offices to review';
      case 'TOURISM_OFFICER_ASSIGNMENTS_COMPLETED': return 'Additional offices completed their reviews';
      case 'OFFICE_FINAL_DECISION': return 'Final decision made by an authorized office';
      case 'ROUTE_RETURNED_TO_ADMIN': return 'All assigned offices approved the request';
      case 'ROUTE_REQUIREMENTS_REQUESTED': return 'Municipal office asked for more information or documents';
      case 'REQUIREMENTS_RESUBMITTED': return 'You sent the requested information';
      case 'REVISED_DOCUMENT_SUBMITTED': return 'You uploaded an updated document';
      case 'WORKFLOW_COMPLETED': return 'Request processing completed';
      case 'RETRIEVAL_QR_SCANNED': return 'Document collection QR code scanned';
      case 'RETRIEVAL_LOCATION_UPDATED': return 'Document storage details updated';
      case 'DOCUMENT_RELEASED': return 'Document collected';
      default: {
        const label = actionType.replaceAll('_', ' ').toLowerCase();
        return label.charAt(0).toUpperCase() + label.slice(1);
      }
    }
  };

  if (loading) {
    return (
      <div className="w-full">
        <div className="flex items-center gap-3 rounded-2xl border border-warm-border bg-card px-5 py-8 text-xs text-muted-text">
          <span className="h-2 w-2 animate-pulse rounded-full bg-clay" /> Loading your request...
        </div>
      </div>
    );
  }

  if (!sub) {
    return (
      <div className="w-full">
        <div className="rounded-2xl border border-rejected-bg bg-rejected-bg/50 px-5 py-8 text-xs font-semibold text-rejected-text">
          We couldn't find this request. It may have been removed or you may not have access.
        </div>
      </div>
    );
  }

  const statusConfig = getStatusStyles(sub.status);

  const isCompleted = sub.status === 'completed' || sub.status === 'approved';
  const isWithdrawn = sub.status === 'withdrawn';
  const isPermanentlyClosed = sub.status === 'closed_by_submitter';
  const completionDate = sub.status === 'approved'
    ? sub.final_decided_at ?? sub.approved_at
    : sub.completed_at;
  const isChangesRequested = sub.status === 'changes_requested'
    || sub.status === 'returned_for_requirements';
  const isRedirectable = sub.status === 'returned';
  const currentDestinationRole = sub.selected_office_role ?? sub.initial_destination_role ?? null;
  const currentDestinationLabel = isOfficeRole(currentDestinationRole)
    ? OFFICE_CONFIG[currentDestinationRole].label
    : 'Not selected';
  const initialDestinationRole = sub.initial_destination_role ?? null;
  const responsibleOfficeRole = sub.selected_office_role
    ?? sub.initial_destination_role
    ?? null;
  const canGenerateRetrievalQr = isCompleted;
  const requirementsRequest = [...auditLogs]
    .reverse()
    .find((log) => ['CHANGES_REQUESTED', 'ROUTE_REQUIREMENTS_REQUESTED'].includes(log.action_type));
  const openChangeRequest = revisionHistory?.changeRequests.find((request) =>
    request.status === 'open' && request.againstRevisionId === sub.current_revision_id
  ) ?? null;
  const submitterActions = getAvailableActions({
    status: sub.status,
    reopen_count: sub.reopen_count,
    has_open_change_request: openChangeRequest !== null,
    change_request_repair_needed: revisionHistory?.changeRequestRepairNeeded,
  }, [], 'submitter');
  const canRevise = submitterActions.includes('revise_submission');
  const canClosePermanently = submitterActions.includes('close_permanently');
  const requestProfile = Array.isArray(requirementsRequest?.profiles)
    ? requirementsRequest.profiles[0]
    : requirementsRequest?.profiles;
  const requestOfficeRole = openChangeRequest?.requestedByOffice ?? null;
  const requestAuthor = isOfficeRole(requestOfficeRole)
    ? OFFICE_CONFIG[requestOfficeRole].label
    : requestProfile?.full_name || 'the office handling your request';
  const requestMessage = openChangeRequest?.message
    || requirementsRequest?.comments
    || sub.office_comments
    || sub.mayor_comments
    || 'The office handling your request has asked you to make changes.';

  const downloadAttachment = async (attachment: Attachment) => {
    const { data, error } = await supabase.storage
      .from('workflow_uploads')
      .createSignedUrl(attachment.file_path, 300);
    if (error || !data?.signedUrl) {
      logClientError('Could not authorize attachment download:', error?.message);
      setActionError('Could not open this additional document. Please try again.');
      return;
    }
    await downloadFile(data.signedUrl, attachment.file_name);
  };

  const downloadOriginal = async () => {
    if (!sub) return;
    try {
      const url = await getFileUrl(supabase, sub);
      await downloadFile(url, sub.file_name);
    } catch (error) {
      logClientError('Could not download the original document:', error);
      setActionError('Could not download the original document. Please try again.');
    }
  };

  const previewingAttachment = attachments.find((attachment) => attachment.id === previewingAttachmentId);

  return (
    <div className="mx-auto flex w-full max-w-[1500px] flex-col pb-8">
      <div className="order-0 mb-5 max-md:mb-4">
        <button
          type="button"
          onClick={() => router.push('/workflow/user/file_registry')}
          className="inline-flex items-center gap-2 text-xs font-semibold text-muted-text transition-colors hover:text-clay"
        >
          <span className="grid h-8 w-8 place-items-center rounded-full border border-warm-border bg-card" aria-hidden="true">←</span>
          Back to my files
        </button>
      </div>

      <section className="order-1 mb-5 overflow-hidden rounded-2xl border border-warm-border bg-card shadow-[0_12px_35px_rgba(65,49,39,0.05)]">
        <div className="flex flex-col gap-5 p-5 md:flex-row md:items-center md:justify-between md:p-7">
          <div className="min-w-0">
            <div className="mb-3 flex flex-wrap items-center gap-2.5">
              <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-bold ${statusConfig.classes}`}>
                <span className={`h-1.5 w-1.5 rounded-full bg-current ${isCompleted || isWithdrawn ? 'opacity-70' : 'animate-pulse'}`} />
                {statusConfig.label}
              </span>
              <span className="text-[11px] font-medium text-muted-text">
                Request ID: {sub.id.split('-')[0]}
              </span>
              {isOfficeRole(currentDestinationRole) && (
                <span className="text-[11px] font-medium text-muted-text">
                  · {OFFICE_CONFIG[currentDestinationRole].label}
                </span>
              )}
            </div>
            <h1 className={`${fonts.serif} max-w-4xl break-words text-[28px] font-semibold leading-[1.15] tracking-[-0.02em] text-warm-text md:text-[36px]`}>
              {sub.file_name}
            </h1>
            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] text-muted-text">
              <span>Submitted {new Date(sub.created_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</span>
              <span>{sub.file_type || 'File'} · {sub.file_size ? `${(sub.file_size / 1024).toFixed(2)} KB` : 'Size unavailable'}</span>
            </div>
          </div>
          <div className="shrink-0 rounded-xl border border-warm-border bg-white px-5 py-3.5 md:text-right">
            <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-text">Tracking Number</p>
            <p className="font-mono text-sm font-bold tracking-[0.08em] text-clay">
              {sub.tracking_number || 'Pending'}
            </p>
          </div>
        </div>

        <section className="border-t border-warm-border px-5 py-6 md:px-7">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-clay">About your request</p>
              <h2 className="mt-1 font-serif text-xl font-semibold text-warm-text">Request details</h2>
            </div>
            <span className="rounded-full bg-clay-soft px-3 py-1.5 text-[10px] font-bold text-clay">
              {getWorkflowDocumentTypeLabel(sub.category, sub.other_document_type)}
            </span>
          </div>
          <div className="grid gap-x-8 gap-y-5 md:grid-cols-2">
            <div>
              <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-text">Who this is for</p>
              <p className="text-xs font-semibold text-warm-text">{sub.intended_recipient || 'Not specified.'}</p>
            </div>
            {currentDestinationRole && (
              <div>
                <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-text">Office handling your request</p>
                <p className="text-xs font-semibold text-warm-text">{currentDestinationLabel}</p>
                {isOfficeRole(initialDestinationRole) && initialDestinationRole !== currentDestinationRole && (
                  <p className="mt-1 text-[10px] text-muted-text">
                    Initially selected: {OFFICE_CONFIG[initialDestinationRole].label}
                  </p>
                )}
              </div>
            )}
            <div className="md:col-span-2">
              <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-text">Purpose or details</p>
              <blockquote className="whitespace-pre-wrap break-words border-l-2 border-clay pl-3 font-serif text-[14px] italic leading-relaxed text-warm-text/75">
                {sub.description || 'No description provided.'}
              </blockquote>
            </div>
          </div>
        </section>

        <section className="border-t border-warm-border">
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
                <span className="block text-[10px] font-bold uppercase tracking-[0.15em] text-clay">Your document</span>
                <span className="mt-1 block truncate text-xs font-semibold text-warm-text">{sub.file_name}</span>
                <span className="mt-1 block text-[10px] font-medium text-muted-text">
                  {previewOpen ? 'Close document preview' : 'Open document preview'}
                </span>
              </span>
              <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full border transition-colors ${
                previewOpen
                  ? 'rotate-90 border-clay bg-clay-soft text-clay'
                  : 'border-warm-border text-muted-text'
              }`} aria-hidden="true">
                ›
              </span>
            </button>
            <button
              type="button"
              onClick={() => void downloadOriginal()}
              aria-label={`Download ${sub.file_name}`}
              className="inline-flex h-9 shrink-0 items-center gap-2 rounded-full border border-warm-border px-3.5 text-[11px] font-bold text-warm-text hover:bg-sidebar"
            >
              <span aria-hidden="true">↓</span>
              <span className="hidden sm:inline">Download</span>
            </button>
            {attachments.length > 0 && (
              <button
                type="button"
                onClick={() => setSupportingAttachmentsOpen((open) => !open)}
                aria-label={`${supportingAttachmentsOpen ? 'Hide' : 'Show'} ${attachments.length} additional documents`}
                aria-expanded={supportingAttachmentsOpen}
                aria-controls={`supporting-attachments-${sub.id}`}
                title={`${attachments.length} additional ${attachments.length === 1 ? 'document' : 'documents'}`}
                className={`relative grid h-9 w-9 shrink-0 place-items-center rounded-full border transition-colors ${
                  supportingAttachmentsOpen
                    ? 'border-clay bg-clay-soft text-clay'
                    : 'border-warm-border text-warm-text hover:bg-sidebar'
                }`}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="m20 11-8.5 8.5a5 5 0 0 1-7-7L14 3a3.5 3.5 0 0 1 5 5l-9.5 9.5a2 2 0 0 1-3-3L15 6" />
                </svg>
                <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-clay px-1 text-[9px] font-bold leading-none text-white">
                  {attachments.length}
                </span>
              </button>
            )}
          </div>
          {attachments.length > 0 && (
            <div
              id={`supporting-attachments-${sub.id}`}
              hidden={!supportingAttachmentsOpen}
              className="border-b border-warm-border bg-sidebar/40 px-5 py-4 md:px-7"
            >
              <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-text">Additional documents</p>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {attachments.map((attachment) => (
                  <div key={attachment.id} className="flex min-w-0 items-center gap-3 rounded-xl border border-warm-border bg-card p-3 text-warm-text">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-clay-soft text-clay" aria-hidden="true">▤</span>
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
                        onClick={() => setPreviewingAttachmentId((current) => current === attachment.id ? null : attachment.id)}
                        aria-label={`${previewingAttachmentId === attachment.id ? 'Close preview of' : 'Preview'} ${attachment.file_name}`}
                        aria-pressed={previewingAttachmentId === attachment.id}
                        className={`grid h-9 w-9 place-items-center rounded-full transition-colors ${
                          previewingAttachmentId === attachment.id ? 'bg-clay-soft text-clay' : 'text-muted-text hover:bg-sidebar hover:text-warm-text'
                        }`}
                      >
                        <span aria-hidden="true">⌕</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => void downloadAttachment(attachment)}
                        aria-label={`Download ${attachment.file_name}`}
                        className="grid h-9 w-9 place-items-center rounded-full text-muted-text transition-colors hover:bg-sidebar hover:text-warm-text"
                      >
                        <span aria-hidden="true">↓</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              {previewingAttachment && (
                <section className="mt-4 overflow-hidden rounded-xl border border-warm-border bg-card">
                  <header className="flex items-center justify-between gap-3 border-b border-warm-border px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-clay">Additional document preview</p>
                      <h3 className="mt-1 truncate text-xs font-semibold text-warm-text">{previewingAttachment.file_name}</h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => setPreviewingAttachmentId(null)}
                      aria-label="Close additional document preview"
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-warm-border text-muted-text hover:bg-sidebar"
                    >
                      ×
                    </button>
                  </header>
                  <div className="relative flex h-[min(65vh,680px)] min-h-[360px] items-center justify-center overflow-auto bg-[#eae5df] p-4 md:p-6">
                    <FilePreview file={{
                      file_name: previewingAttachment.file_name,
                      file_url: '',
                      file_path: previewingAttachment.file_path,
                      file_type: previewingAttachment.file_type,
                    }} />
                  </div>
                </section>
              )}
            </div>
          )}
          <div id={`document-preview-${sub.id}`} hidden={!previewOpen}>
            {previewOpen && (
              <div className="relative flex h-[min(70vh,760px)] min-h-[540px] items-center justify-center overflow-auto bg-[#eae5df] p-5 md:p-8 max-lg:h-[min(65vh,480px)] max-lg:min-h-[min(65vh,360px)]">
                <FilePreview file={sub} />
              </div>
            )}
          </div>
        </section>
      </section>

      {(isChangesRequested || isRedirectable || isCompleted) && (
      <div className="order-2 mb-5">
        <section className="rounded-2xl border border-warm-border bg-card p-5 md:p-6">
          <div className="mb-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-clay">Collect your document</p>
            <h2 className="mt-1 font-serif text-xl font-semibold text-warm-text">Pickup QR code</h2>
          </div>
          <p className="mb-4 text-[11px] leading-relaxed text-muted-text">
            When processing is complete, generate a QR code to show the staff member when you collect your document.
          </p>
          {!canGenerateRetrievalQr ? (
            <p className="rounded-xl bg-sidebar px-3 py-3 text-xs text-muted-text">
              A pickup QR code will be available when processing is complete.
            </p>
          ) : retrievalQr?.retrieval_status === 'active' || retrievalQr?.retrieval_status === 'released' ? (
            <div className="retrieval-qr-print rounded-xl border border-warm-border bg-white p-4 text-center">
              {qrImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={qrImage}
                  alt={`Pickup QR code for ${sub.tracking_number}`}
                  className="mx-auto h-64 w-64 max-w-full"
                />
              ) : (
                <p className="py-12 text-xs text-muted-text">Preparing your QR code...</p>
              )}
              <p className="mt-2 text-sm font-bold text-warm-text">Tracking Number: {sub.tracking_number}</p>
              <p className="mt-2 text-xs text-warm-text">
                Show this QR code to the authorized staff member when you collect your document.
              </p>
              <p className="mt-2 text-[10px] text-muted-text">
                Valid through {new Date(retrievalQr.expires_at).toLocaleDateString()}
              </p>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => void generateRetrievalQr()}
              disabled={qrLoading}
              className="inline-flex h-10 w-full items-center justify-center rounded-full bg-clay px-4 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {qrLoading ? 'Creating QR code...' : 'Create pickup QR code'}
            </button>
          )}
          {(retrievalQr?.retrieval_status === 'active' || retrievalQr?.retrieval_status === 'released') && (
            <div className="mt-4 flex gap-2 print:hidden">
              <button
                type="button"
                onClick={downloadRetrievalQr}
                disabled={!qrImage}
                className="inline-flex h-10 flex-1 items-center justify-center rounded-full border border-warm-border px-4 text-xs font-semibold text-warm-text disabled:cursor-not-allowed disabled:opacity-50"
              >
                Download QR image
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                disabled={!qrImage}
                className="inline-flex h-10 flex-1 items-center justify-center rounded-full border border-warm-border px-4 text-xs font-semibold text-warm-text disabled:cursor-not-allowed disabled:opacity-50"
              >
                Print QR code
              </button>
            </div>
          )}
          {qrError && <p role="alert" className="mt-3 text-xs text-rejected-text">{qrError}</p>}
          {qrOriginWarning && (
            <p role="status" className="mt-3 rounded-xl bg-pending-bg px-3 py-2 text-[11px] leading-relaxed text-pending-text">
              {qrOriginWarning}
            </p>
          )}
          {isCompleted && (
            <div className="mt-4 space-y-3 rounded-xl border border-approved-bg bg-approved-bg/40 p-4">
              <p className="text-xs font-semibold text-approved-text">
                {sub.status === 'approved' ? 'Your request was approved' : 'Request processing is complete'}
              </p>
              <p className="text-[11px] text-warm-text">
                {sub.status === 'approved' ? 'Approved' : 'Processing completed'} by {closureActor || 'an authorized office representative'}
                {completionDate
                  ? ` on ${new Date(completionDate).toLocaleString()}`
                  : ''}.
                {sub.status !== 'approved' && ' This means the office has finished processing your request; it does not necessarily mean it was approved.'}
              </p>
              {sub.closure_note && (
                <div className="space-y-1">
                  <p className="text-[10px] font-semibold text-muted-text">Note from the office</p>
                  <p className="whitespace-pre-wrap rounded-xl bg-card/70 p-3 text-xs leading-relaxed text-warm-text">
                    {sub.closure_note}
                  </p>
                </div>
              )}
              {sub.closure_file_path && sub.closure_file_name && (
                <button
                  type="button"
                  onClick={() => void downloadAttachment({
                    id: 'closure-file',
                    file_name: sub.closure_file_name!,
                    file_path: sub.closure_file_path!,
                    file_type: sub.closure_file_type ?? null,
                    file_size: sub.closure_file_size ?? 0,
                  })}
                  className="text-xs font-semibold text-clay underline underline-offset-2"
                >
                  Download the completion document: {sub.closure_file_name}
                </button>
              )}
            </div>
          )}
        </section>
      </div>
      )}

      <div className="order-4 mb-5">
        <WorkflowStatusPanel
          submissionId={sub.id}
          submissionStatus={sub.status}
          responsibleOfficeRole={responsibleOfficeRole}
          receivedAt={sub.received_at}
          currentRoutePlanId={currentRoutePlanId}
          steps={routeSteps}
          finalDecisionOfficeRole={sub.final_decision_office_role}
          finalDecidedAt={sub.final_decided_at}
          approvedAt={sub.approved_at}
          rejectedAt={sub.rejected_at}
          completedAt={sub.completed_at}
          routeError={routeError}
        />
      </div>

      {isPermanentlyClosed && (
        <div className="order-5 mb-5 rounded-2xl border border-warm-border bg-sidebar/60 px-5 py-4 text-xs leading-relaxed text-muted-text" role="status">
          You permanently closed this request. It cannot be reopened, but your files and history are still available here.
        </div>
      )}

      <div className="order-6 space-y-5">
      <DocumentMessaging
        key={sub.id}
        submissionId={sub.id}
        fileName={sub.file_name}
        trackingNumber={sub.tracking_number}
        submitterConversationLabel="Request conversation"
        canSendSubmitterConversation={!isCompleted && !isWithdrawn}
        activity={(
          <div>
            <WorkflowActivityTimeline
              emptyMessage="No updates have been recorded yet."
              showComments={false}
              events={auditLogs.map((log) => {
                const profile = Array.isArray(log.profiles) ? log.profiles[0] : log.profiles;
                return {
                  id: log.id,
                  actionType: log.action_type,
                  label: getWorkflowActionLabel(log.action_type),
                  createdAt: log.created_at,
                  actor: profile?.full_name || 'System',
                  actorRole: profile?.role,
                  comments: log.comments,
                };
              })}
            />
          </div>
        )}
      />
      <WorkflowRevisionTimeline
        history={revisionHistory}
        loading={revisionHistoryLoading}
        error={revisionHistoryError}
      />
      </div>

      {(isChangesRequested || isRedirectable) && (
        <section className="order-3 mt-5 overflow-hidden rounded-2xl border border-warm-border bg-card">
          <header className="border-b border-warm-border px-5 py-4 md:px-6">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-clay">
              {isChangesRequested               ? 'Changes requested' : 'Choose a new office'}
            </p>
            <h2 className="mt-1 font-serif text-xl font-semibold text-warm-text">
              {isChangesRequested ? 'Please review the office’s request' : 'Send your request to a different office'}
            </h2>
            <p className="mt-1.5 text-[11px] leading-relaxed text-muted-text">
              {isChangesRequested
                ? 'Processing is paused while you respond. You can message the office, update your files and resubmit once, or permanently close the request.'
                : 'Choose the office that should handle your request next.'}
            </p>
          </header>
          <div className="grid gap-4 bg-[#f8f5f1] p-5 md:grid-cols-2 md:p-6">
            {isChangesRequested && (
              <div className="space-y-3 rounded-xl border border-pending-text/20 bg-pending-bg/50 p-4 md:col-span-2" role="status">
                <div>
                  <h3 className="text-xs font-semibold text-warm-text">The office requested changes</h3>
                  <p className="mt-1 text-[10px] font-medium text-muted-text">
                    Requested by {requestAuthor}
                    {openChangeRequest?.createdAt
                      ? ` · ${new Date(openChangeRequest.createdAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}`
                      : ''}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap break-words text-[11px] leading-relaxed text-muted-text">
                    {requestMessage}
                  </p>
                </div>
                <p className="text-[11px] leading-relaxed text-muted-text">
                  Message the office above if you need clarification. Sending a message will not change your request status.
                </p>
              </div>
            )}

            {canRevise && (
              <div className="space-y-4 rounded-xl border border-clay/25 bg-card p-4 md:col-span-2">
                {!revisionEditorOpen ? (
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h3 className="text-xs font-semibold text-warm-text">Update your files and resubmit</h3>
                      <p className="mt-1 text-[11px] leading-relaxed text-muted-text">
                        Keep, replace, or remove files, and add additional documents if needed. Add or replace at least one file to send your updated request back to {currentDestinationLabel}.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={startRevision}
                      disabled={revisionHistoryLoading || submittingRevision || closingPermanently}
                      className="inline-flex h-10 shrink-0 items-center justify-center rounded-full bg-clay px-5 text-xs font-semibold text-white transition-colors hover:bg-warm-text disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Update files
                    </button>
                  </div>
                ) : (
                  <form onSubmit={(event) => void submitRevision(event)} className="space-y-4">
                    <div>
                      <h3 className="text-xs font-semibold text-warm-text">Choose which files to update</h3>
                      <p className="mt-1 text-[11px] leading-relaxed text-muted-text">
                        Your destination and request details will stay the same. Your updated files will be sent back to {requestAuthor}.
                      </p>
                      <p className="mt-2 text-[10px] text-muted-text">
                        {currentDestinationLabel} · {getWorkflowDocumentTypeLabel(sub.category, sub.other_document_type)}
                      </p>
                    </div>

                    <ul className="space-y-2">
                      {revisionDraftFiles.map((entry, index) => (
                        <li key={entry.file.id} className="grid gap-3 rounded-xl border border-warm-border bg-sidebar/40 p-3 sm:grid-cols-[minmax(0,1fr)_170px] sm:items-center">
                          <div className="min-w-0">
                            <p className="break-words text-xs font-semibold text-warm-text">{entry.file.fileName}</p>
                            <p className="mt-0.5 text-[10px] text-muted-text">
                              {entry.file.fileRole === 'primary' ? 'Main document' : 'Additional document'}
                              {' · '}
                              {Math.max(1, Math.round(entry.file.fileSize / 1024))} KB
                            </p>
                            {entry.action === 'replace' && (
                              <label className="mt-2 block text-[10px] font-semibold text-muted-text">
                                Choose a replacement file
                                <input
                                  type="file"
                                  accept={entry.file.fileRole === 'primary' ? WORKFLOW_DOCUMENT_ACCEPT : WORKFLOW_ATTACHMENT_ACCEPT}
                                  onChange={(event) => handleRevisionReplacement(index, event)}
                                  disabled={submittingRevision}
                                  className="mt-1 block w-full text-[10px] font-medium text-warm-text file:mr-2 file:rounded-full file:border-0 file:bg-clay-soft file:px-3 file:py-1.5 file:text-[10px] file:font-semibold file:text-clay"
                                />
                                {entry.replacement && (
                                  <span className="mt-1 block break-words font-normal">{entry.replacement.name}</span>
                                )}
                              </label>
                            )}
                          </div>
                          <label className="block text-[10px] font-bold uppercase tracking-[0.1em] text-muted-text">
                            What would you like to do with this file?
                            <select
                              value={entry.action}
                              onChange={(event) => {
                                const value = event.target.value;
                                if (value !== 'keep' && value !== 'replace' && value !== 'remove') return;
                                setRevisionDraftFiles((current) => current.map((draft, draftIndex) =>
                                  draftIndex === index
                                    ? { ...draft, action: value, replacement: value === 'replace' ? draft.replacement : null }
                                    : draft
                                ));
                                setActionError('');
                              }}
                              disabled={submittingRevision}
                              className="mt-1 block h-9 w-full rounded-lg border border-warm-border bg-white px-2 text-xs font-medium normal-case tracking-normal text-warm-text outline-none focus:border-clay"
                            >
                              <option value="keep">Keep as is</option>
                              <option value="replace">Replace</option>
                              <option value="remove" disabled={entry.file.fileRole === 'primary'}>Remove</option>
                            </select>
                          </label>
                        </li>
                      ))}
                    </ul>

                    <div className="space-y-2">
                      <label className="block text-[10px] font-bold uppercase tracking-[0.1em] text-muted-text">
                        Add additional documents
                        <input
                          type="file"
                          accept={WORKFLOW_ATTACHMENT_ACCEPT}
                          multiple
                          onChange={handleRevisionAddedFiles}
                          disabled={submittingRevision}
                          className="mt-1 block w-full text-[10px] font-medium normal-case tracking-normal text-warm-text file:mr-2 file:rounded-full file:border-0 file:bg-clay-soft file:px-3 file:py-1.5 file:text-[10px] file:font-semibold file:text-clay"
                        />
                      </label>
                      {revisionAddedFiles.length > 0 && (
                        <ul className="space-y-1">
                          {revisionAddedFiles.map((file, index) => (
                            <li key={`${file.name}-${index}`} className="flex items-center justify-between gap-3 rounded-lg bg-sidebar/60 px-3 py-2 text-[10px] text-warm-text">
                              <span className="min-w-0 break-words">{file.name} · {(file.size / 1024).toFixed(1)} KB</span>
                              <button
                                type="button"
                                onClick={() => setRevisionAddedFiles((current) => current.filter((_, fileIndex) => fileIndex !== index))}
                                disabled={submittingRevision}
                                aria-label={`Remove ${file.name} from your updated files`}
                                className="shrink-0 font-semibold text-clay underline underline-offset-2 disabled:opacity-50"
                              >
                                Remove
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <label className="block text-[10px] font-bold uppercase tracking-[0.1em] text-muted-text">
                      Optional message to {requestAuthor}
                      <textarea
                        value={revisionMessage}
                        onChange={(event) => setRevisionMessage(event.target.value)}
                        maxLength={4000}
                        rows={3}
                        disabled={submittingRevision}
                        className="mt-1 block min-h-20 w-full resize-y rounded-xl border border-warm-border bg-white p-3 text-xs font-normal normal-case leading-relaxed tracking-normal text-warm-text outline-none focus:border-clay disabled:opacity-60"
                        placeholder="Tell the office what you changed or add any helpful details."
                      />
                    </label>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="submit"
                        disabled={submittingRevision || closingPermanently}
                        className="inline-flex h-10 items-center justify-center rounded-full bg-clay px-5 text-xs font-semibold text-white transition-colors hover:bg-warm-text disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {submittingRevision ? 'Sending your updated request...' : 'Send updated request'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setRevisionEditorOpen(false)}
                        disabled={submittingRevision}
                        className="inline-flex h-10 items-center justify-center rounded-full border border-warm-border px-5 text-xs font-semibold text-warm-text hover:bg-sidebar disabled:opacity-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}

            {canClosePermanently && (
              <div className="flex flex-col gap-3 rounded-xl border border-rejected-bg bg-card p-4 md:col-span-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-xs font-semibold text-warm-text">Close this request permanently</h3>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-text">
                    You can’t undo this. Your files and version history will remain available.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void closePermanently()}
                  disabled={closingPermanently || submittingRevision}
                  className="inline-flex h-10 shrink-0 items-center justify-center rounded-full border border-rejected-text px-5 text-xs font-semibold text-rejected-text transition-colors hover:bg-rejected-bg/40 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {closingPermanently ? 'Closing request...' : 'Close request permanently'}
                </button>
              </div>
            )}

            {isRedirectable && (
              <form onSubmit={(event) => void handleRedirectSubmit(event)} className="space-y-3 rounded-xl border border-warm-border bg-card p-4">
                <div>
                  <h3 className="text-xs font-semibold text-warm-text">Choose a different office</h3>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-text">
                    Select the office that should handle your request. Your existing document will be sent with it.
                  </p>
                </div>
                <label className="block text-[10px] font-bold uppercase tracking-[0.1em] text-muted-text">
                  New office
                  <select
                    aria-label="New destination office"
                    value={redirectOffice}
                    onChange={(event) => {
                      const value = event.target.value;
                      setRedirectOffice(isOfficeRole(value) ? value : '');
                      setRedirectDocumentType('');
                      setRedirectOtherDocumentType('');
                    }}
                    disabled={savingRedirect}
                    className="mt-1.5 block h-10 w-full rounded-xl border border-warm-border bg-white px-3 text-xs font-medium normal-case tracking-normal text-warm-text outline-none focus:border-clay"
                  >
                    <option value="">Choose an office</option>
                    {Object.entries(OFFICE_CONFIG).map(([officeRole, office]) => (
                      <option key={officeRole} value={officeRole}>{office.label}</option>
                    ))}
                  </select>
                </label>
                <label className="block text-[10px] font-bold uppercase tracking-[0.1em] text-muted-text">
                  Document type
                  <select
                    aria-label="Redirect document type"
                    value={redirectDocumentType}
                    onChange={(event) => {
                      setRedirectDocumentType(event.target.value);
                      setRedirectOtherDocumentType('');
                    }}
                    disabled={savingRedirect || !isOfficeRole(redirectOffice)}
                    className="mt-1.5 block h-10 w-full rounded-xl border border-warm-border bg-white px-3 text-xs font-medium normal-case tracking-normal text-warm-text outline-none focus:border-clay"
                  >
                    <option value="">Choose a document type</option>
                    {isOfficeRole(redirectOffice) && OFFICE_CONFIG[redirectOffice].categories.map((category) => (
                      <option key={category} value={category}>{category}</option>
                    ))}
                  </select>
                </label>
                {redirectDocumentType === 'Other' && (
                  <label className="block text-[10px] font-bold uppercase tracking-[0.1em] text-muted-text">
                    Describe the document type
                    <input
                      value={redirectOtherDocumentType}
                      onChange={(event) => setRedirectOtherDocumentType(event.target.value)}
                      maxLength={120}
                      disabled={savingRedirect}
                      className="mt-1.5 block h-10 w-full rounded-xl border border-warm-border bg-white px-3 text-xs font-medium normal-case tracking-normal text-warm-text outline-none focus:border-clay"
                    />
                  </label>
                )}
                <button
                  type="submit"
                  disabled={savingRedirect || !isOfficeRole(redirectOffice) || !redirectDocumentType || (redirectDocumentType === 'Other' && !redirectOtherDocumentType.trim())}
                  className="inline-flex h-10 items-center justify-center rounded-full bg-clay px-5 text-xs font-semibold text-white transition-colors hover:bg-warm-text disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {savingRedirect ? 'Sending request...' : 'Send to this office'}
                </button>
              </form>
            )}

          </div>
        </section>
      )}
      {actionError && (
        <p role="alert" className="order-3 mt-4 rounded-xl border border-rejected-bg bg-rejected-bg/50 px-4 py-3 text-xs font-medium text-rejected-text">
          {actionError}
        </p>
      )}

    </div>
  );
}