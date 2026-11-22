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

export const FILE_BROWSER_SORT_OPTIONS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'file_name_asc', label: 'File name (A–Z)' },
  { value: 'file_name_desc', label: 'File name (Z–A)' },
  { value: 'status_asc', label: 'Status (A–Z)' },
  { value: 'tracking_number_asc', label: 'Tracking number (A–Z)' },
  { value: 'tracking_number_desc', label: 'Tracking number (Z–A)' },
] as const;

export type FileBrowserSort = (typeof FILE_BROWSER_SORT_OPTIONS)[number]['value'];
export const ADMIN_DOCUMENT_PAGE_SIZE = 100;

export function isFileBrowserSort(value: string): value is FileBrowserSort {
  return FILE_BROWSER_SORT_OPTIONS.some((option) => option.value === value);
}

export const DASHBOARD_SUBMISSION_LIMIT = 5;

interface SortableSubmission {
  id: string;
  created_at: string;
  file_name: string;
  status: string;
  tracking_number: string | null;
}

export function sortFileBrowserSubmissions<T extends SortableSubmission>(
  submissions: readonly T[],
  sort: FileBrowserSort,
): T[] {
  const compareText = (first: string | null, second: string | null) =>
    (first ?? '').localeCompare(second ?? '', undefined, { numeric: true, sensitivity: 'base' });

  return [...submissions].sort((first, second) => {
    let comparison: number;
    switch (sort) {
      case 'oldest':
        comparison = Date.parse(first.created_at) - Date.parse(second.created_at);
        break;
      case 'file_name_asc':
        comparison = compareText(first.file_name, second.file_name);
        break;
      case 'file_name_desc':
        comparison = compareText(second.file_name, first.file_name);
        break;
      case 'status_asc':
        comparison = compareText(first.status, second.status);
        break;
      case 'tracking_number_asc':
        comparison = compareText(first.tracking_number, second.tracking_number);
        break;
      case 'tracking_number_desc':
        comparison = compareText(second.tracking_number, first.tracking_number);
        break;
      default:
        comparison = Date.parse(second.created_at) - Date.parse(first.created_at);
        break;
    }

    return comparison || first.id.localeCompare(second.id);
  });
}

export function paginateFileBrowserItems<T>(
  items: readonly T[],
  requestedPage: number,
  pageSize: number,
) {
  if (!Number.isSafeInteger(requestedPage) || requestedPage < 1) {
    throw new RangeError('Page must be a positive integer.');
  }
  if (!Number.isSafeInteger(pageSize) || pageSize < 1) {
    throw new RangeError('Page size must be a positive integer.');
  }

  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const page = Math.min(requestedPage, totalPages);
  const startIndex = (page - 1) * pageSize;
  const pageItems = items.slice(startIndex, startIndex + pageSize);

  return {
    items: pageItems,
    page,
    totalPages,
    start: pageItems.length === 0 ? 0 : startIndex + 1,
    end: startIndex + pageItems.length,
  };
}

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
