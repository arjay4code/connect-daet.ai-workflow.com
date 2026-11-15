import type { OfficeRole } from './offices';
import type { OfficeDashboardSubmission } from './office-dashboard.ts';

export const FILE_BROWSER_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'needs_attention', label: 'Needs attention' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'rejected', label: 'Rejected' },
] as const;

export type FileBrowserFilter = (typeof FILE_BROWSER_FILTERS)[number]['value'];

export const DASHBOARD_SUBMISSION_LIMIT = 5;

export function getDashboardSubmissionPreview<T>(submissions: readonly T[]): T[] {
  return submissions.slice(0, DASHBOARD_SUBMISSION_LIMIT);
}

const IN_PROGRESS_STATUSES = new Set([
  'submitted',
  'in_process',
  'pending',
  'pending_approver',
  'pending_admin',
  'pending_office',
  'pending_mayor',
]);

const NEEDS_ATTENTION_STATUSES = new Set([
  'changes_requested',
  'returned_for_requirements',
  'returned',
]);

const COMPLETED_STATUSES = new Set(['approved', 'completed']);

const REJECTED_STATUSES = new Set([
  'declined_by_approver',
  'declined_by_admin',
  'declined_by_office',
  'declined_by_mayor',
  'rejected',
]);

export function isFileBrowserFilter(value: string): value is FileBrowserFilter {
  return FILE_BROWSER_FILTERS.some((filter) => filter.value === value);
}

export function matchesFileBrowserFilter(status: string, filter: FileBrowserFilter) {
  const normalizedStatus = status.toLowerCase();
  switch (filter) {
    case 'in_progress':
      return IN_PROGRESS_STATUSES.has(normalizedStatus);
    case 'needs_attention':
      return NEEDS_ATTENTION_STATUSES.has(normalizedStatus);
    case 'completed':
      return COMPLETED_STATUSES.has(normalizedStatus);
    case 'rejected':
      return REJECTED_STATUSES.has(normalizedStatus);
    default:
      return true;
  }
}

export function matchesOfficeFileBrowserFilter(
  submission: OfficeDashboardSubmission,
  filter: FileBrowserFilter,
  role: OfficeRole,
) {
  const belongsToOffice = submission.selected_office_role === role
    || submission.officeRecord !== null
    || Boolean(submission.consultedRecord);
  if (!belongsToOffice) return false;

  return matchesFileBrowserFilter(submission.status, filter);
}
