import type { createClient } from '@/lib/supabase/client';
import { parseWorkflowRevisionHistory, type WorkflowRevisionHistory } from './revisions.ts';

type JsonRecord = Record<string, unknown>;

export interface WorkflowSubmissionDetailRecord {
  id: string;
  user_id: string;
  tracking_number: string | null;
  file_name: string;
  file_url: string;
  file_path: string | null;
  file_type: string;
  file_size: number;
  status: string;
  category: string | null;
  other_document_type: string | null;
  description: string | null;
  purpose: string | null;
  requested_action: string | null;
  intended_recipient: string | null;
  initial_destination_role: string | null;
  selected_office_role: string | null;
  current_revision_id: string | null;
  reopen_count: number | null;
  closure_reason: string | null;
  closed_at: string | null;
  received_at: string | null;
  received_by: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  closed_by: string | null;
  closure_note: string | null;
  closure_file_path: string | null;
  closure_file_name: string | null;
  closure_file_type: string | null;
  closure_file_size: number | null;
  approver_comments: string | null;
  admin_comments: string | null;
  office_comments: string | null;
  mayor_comments: string | null;
  rejection_comment: string | null;
  sender_response: string | null;
  archived_at: string | null;
  retention_until: string | null;
  final_decision_office_role: string | null;
  final_decision_by: string | null;
  final_decided_at: string | null;
  approved_at: string | null;
  rejected_at: string | null;
}

export interface WorkflowSubmissionRouteStep {
  id: string;
  routing_plan_id: string;
  sequence_number: number;
  office_role: string;
  status: string;
  assigned_by: string | null;
  assigned_by_role: string | null;
  responsibility: string;
  assignment_source: string;
  assigned_at: string | null;
  started_at: string | null;
  decided_at: string | null;
  decided_by: string | null;
  completed_at: string | null;
  completed_by: string | null;
  comments: string | null;
  requirements_requested_at: string | null;
  requirements_comments: string | null;
  outcome: string | null;
}

export interface WorkflowSubmissionProfile {
  email: string | null;
  full_name: string | null;
  role: string | null;
}

export interface WorkflowSupportingFile {
  id: string;
  file_name: string;
  file_path: string;
  file_type: string | null;
  file_size: number;
}

export interface WorkflowSubmissionActivity {
  id: string;
  action_type: string;
  old_status: string | null;
  new_status: string | null;
  comments: string | null;
  created_at: string;
  profiles: WorkflowSubmissionProfile | null;
}

export interface WorkflowSubmissionDetail {
  submission: WorkflowSubmissionDetailRecord;
  sender: WorkflowSubmissionProfile | null;
  closureActor: { full_name: string | null } | null;
  currentRoute: {
    id: string;
    status: string;
    is_current: boolean;
    version: number;
  } | null;
  routePlanIds: string[];
  routeSteps: WorkflowSubmissionRouteStep[];
  supportingFiles: WorkflowSupportingFile[];
  activityLogs: WorkflowSubmissionActivity[];
  revisionHistory: WorkflowRevisionHistory;
}

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const requiredRecord = (value: unknown, label: string): JsonRecord => {
  if (!isRecord(value)) throw new Error(`The submission detail ${label} is invalid.`);
  return value;
};

const requiredString = (record: JsonRecord, key: string): string => {
  const value = record[key];
  if (typeof value !== 'string') throw new Error(`Submission detail field "${key}" is invalid.`);
  return value;
};

const nullableString = (record: JsonRecord, key: string): string | null => {
  const value = record[key];
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') throw new Error(`Submission detail field "${key}" is invalid.`);
  return value;
};

const requiredNumber = (record: JsonRecord, key: string): number => {
  const value = record[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Submission detail field "${key}" is invalid.`);
  }
  return value;
};

const nullableNumber = (record: JsonRecord, key: string): number | null => {
  const value = record[key];
  if (value === null || value === undefined) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Submission detail field "${key}" is invalid.`);
  }
  return value;
};

const requiredArray = (record: JsonRecord, key: string): unknown[] => {
  const value = record[key];
  if (!Array.isArray(value)) throw new Error(`Submission detail field "${key}" is invalid.`);
  return value;
};

const parseSubmission = (value: unknown): WorkflowSubmissionDetailRecord => {
  const record = requiredRecord(value, 'submission');
  return {
    id: requiredString(record, 'id'),
    user_id: requiredString(record, 'user_id'),
    tracking_number: nullableString(record, 'tracking_number'),
    file_name: requiredString(record, 'file_name'),
    file_url: requiredString(record, 'file_url'),
    file_path: nullableString(record, 'file_path'),
    file_type: requiredString(record, 'file_type'),
    file_size: requiredNumber(record, 'file_size'),
    status: requiredString(record, 'status'),
    category: nullableString(record, 'category'),
    other_document_type: nullableString(record, 'other_document_type'),
    description: nullableString(record, 'description'),
    purpose: nullableString(record, 'purpose'),
    requested_action: nullableString(record, 'requested_action'),
    intended_recipient: nullableString(record, 'intended_recipient'),
    initial_destination_role: nullableString(record, 'initial_destination_role'),
    selected_office_role: nullableString(record, 'selected_office_role'),
    current_revision_id: nullableString(record, 'current_revision_id'),
    reopen_count: nullableNumber(record, 'reopen_count'),
    closure_reason: nullableString(record, 'closure_reason'),
    closed_at: nullableString(record, 'closed_at'),
    received_at: nullableString(record, 'received_at'),
    received_by: nullableString(record, 'received_by'),
    completed_at: nullableString(record, 'completed_at'),
    created_at: requiredString(record, 'created_at'),
    updated_at: requiredString(record, 'updated_at'),
    closed_by: nullableString(record, 'closed_by'),
    closure_note: nullableString(record, 'closure_note'),
    closure_file_path: nullableString(record, 'closure_file_path'),
    closure_file_name: nullableString(record, 'closure_file_name'),
    closure_file_type: nullableString(record, 'closure_file_type'),
    closure_file_size: nullableNumber(record, 'closure_file_size'),
    approver_comments: nullableString(record, 'approver_comments'),
    admin_comments: nullableString(record, 'admin_comments'),
    office_comments: nullableString(record, 'office_comments'),
    mayor_comments: nullableString(record, 'mayor_comments'),
    rejection_comment: nullableString(record, 'rejection_comment'),
    sender_response: nullableString(record, 'sender_response'),
    archived_at: nullableString(record, 'archived_at'),
    retention_until: nullableString(record, 'retention_until'),
    final_decision_office_role: nullableString(record, 'final_decision_office_role'),
    final_decision_by: nullableString(record, 'final_decision_by'),
    final_decided_at: nullableString(record, 'final_decided_at'),
    approved_at: nullableString(record, 'approved_at'),
    rejected_at: nullableString(record, 'rejected_at'),
  };
};

const parseProfile = (value: unknown, label: string): WorkflowSubmissionProfile | null => {
  if (value === null || value === undefined) return null;
  const record = requiredRecord(value, label);
  return {
    email: nullableString(record, 'email'),
    full_name: nullableString(record, 'full_name'),
    role: nullableString(record, 'role'),
  };
};

const parseRouteStep = (value: unknown): WorkflowSubmissionRouteStep => {
  const record = requiredRecord(value, 'route step');
  return {
    id: requiredString(record, 'id'),
    routing_plan_id: requiredString(record, 'routing_plan_id'),
    sequence_number: requiredNumber(record, 'sequence_number'),
    office_role: requiredString(record, 'office_role'),
    status: requiredString(record, 'status'),
    assigned_by: nullableString(record, 'assigned_by'),
    assigned_by_role: nullableString(record, 'assigned_by_role'),
    responsibility: requiredString(record, 'responsibility'),
    assignment_source: requiredString(record, 'assignment_source'),
    assigned_at: nullableString(record, 'assigned_at'),
    started_at: nullableString(record, 'started_at'),
    decided_at: nullableString(record, 'decided_at'),
    decided_by: nullableString(record, 'decided_by'),
    completed_at: nullableString(record, 'completed_at'),
    completed_by: nullableString(record, 'completed_by'),
    comments: nullableString(record, 'comments'),
    requirements_requested_at: nullableString(record, 'requirements_requested_at'),
    requirements_comments: nullableString(record, 'requirements_comments'),
    outcome: nullableString(record, 'outcome'),
  };
};

const parseActivity = (value: unknown): WorkflowSubmissionActivity => {
  const record = requiredRecord(value, 'activity entry');
  return {
    id: requiredString(record, 'id'),
    action_type: requiredString(record, 'action_type'),
    old_status: nullableString(record, 'old_status'),
    new_status: nullableString(record, 'new_status'),
    comments: nullableString(record, 'comments'),
    created_at: requiredString(record, 'created_at'),
    profiles: parseProfile(record.profiles, 'activity profile'),
  };
};

const parseCurrentRoute = (value: unknown): WorkflowSubmissionDetail['currentRoute'] => {
  if (value === null || value === undefined) return null;
  const record = requiredRecord(value, 'current route');
  const isCurrent = record.is_current;
  if (typeof isCurrent !== 'boolean') throw new Error('Submission detail field "is_current" is invalid.');
  return {
    id: requiredString(record, 'id'),
    status: requiredString(record, 'status'),
    is_current: isCurrent,
    version: requiredNumber(record, 'version'),
  };
};

const parseSupportingFile = (value: unknown): WorkflowSupportingFile => {
  const record = requiredRecord(value, 'supporting file');
  return {
    id: requiredString(record, 'id'),
    file_name: requiredString(record, 'file_name'),
    file_path: requiredString(record, 'file_path'),
    file_type: nullableString(record, 'file_type'),
    file_size: requiredNumber(record, 'file_size'),
  };
};

export function parseWorkflowSubmissionDetail(value: unknown): WorkflowSubmissionDetail {
  const record = requiredRecord(value, 'response');
  const routePlanIds = requiredArray(record, 'route_plan_ids').map((planId) => {
    if (typeof planId !== 'string') throw new Error('Submission detail contains an invalid route plan id.');
    return planId;
  });

  return {
    submission: parseSubmission(record.submission),
    sender: parseProfile(record.sender, 'sender profile'),
    closureActor: (() => {
      if (record.closure_actor === null || record.closure_actor === undefined) return null;
      const actor = requiredRecord(record.closure_actor, 'closure actor');
      return { full_name: nullableString(actor, 'full_name') };
    })(),
    currentRoute: parseCurrentRoute(record.current_route),
    routePlanIds,
    routeSteps: requiredArray(record, 'routing_steps').map(parseRouteStep),
    supportingFiles: requiredArray(record, 'supporting_files').map(parseSupportingFile),
    activityLogs: requiredArray(record, 'activity_logs').map(parseActivity),
    revisionHistory: parseWorkflowRevisionHistory(value),
  };
}

type WorkflowDetailClient = Pick<ReturnType<typeof createClient>, 'rpc' | 'from'>;

export async function loadWorkflowSubmissionDetail(
  supabase: WorkflowDetailClient,
  submissionId: string,
): Promise<WorkflowSubmissionDetail> {
  const { data, error } = await supabase.rpc('get_workflow_submission_detail', {
    target_submission_id: submissionId,
  });
  if (error) throw new Error(`Could not load this submission: ${error.message}`);
  const detail = parseWorkflowSubmissionDetail(data);
  if (detail.submission.current_revision_id || detail.supportingFiles.length > 0) return detail;

  const { data: legacyFiles, error: legacyFilesError } = await supabase
    .from('workflow_submission_attachments')
    .select('id, file_name, file_path, file_type, file_size')
    .eq('submission_id', submissionId)
    .order('created_at', { ascending: true });
  if (legacyFilesError) {
    throw new Error(`Could not load supporting documents: ${legacyFilesError.message}`);
  }

  return {
    ...detail,
    supportingFiles: (legacyFiles ?? []).map(parseSupportingFile),
  };
}
