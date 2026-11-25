export const TOURISM_OFFICE_ROLE = 'tourism_officer' as const;
export const TOURISM_OFFICE_LABEL = 'Daet Tourism Office';

export const OFFICE_CONFIG = {
  tourism_officer: {
    label: TOURISM_OFFICE_LABEL,
    path: '/workflow/reviewer',
    legacyPath: '/workflow/tourism-office',
  },
  municipal_treasurer: {
    label: "Municipal Treasurer's Office",
    path: '/workflow/reviewer',
    legacyPath: '/workflow/municipal-treasurer',
  },
  mayor_office: {
    label: "Mayor's Office",
    path: '/workflow/reviewer',
    legacyPath: '/workflow/mayor',
  },
  sangguniang_bayan: {
    label: 'Sangguniang Bayan Office',
    path: '/workflow/reviewer',
    legacyPath: '/workflow/sangguniang-bayan',
  },
} as const;

export type OfficeRole = keyof typeof OFFICE_CONFIG;

export type SubmissionDestinationRole = OfficeRole;

export const SUBMISSION_DESTINATION_CONFIG = {
  ...OFFICE_CONFIG,
} as const;

export function getWorkflowDocumentTypeLabel(category: string | null, otherDocumentType?: string | null) {
  if (!category) return 'Unassigned';
  return category === 'Other' && otherDocumentType
    ? `Other — ${otherDocumentType}`
    : category;
}

export function getWorkflowSubmissionTitle(
  requestType: string | null | undefined,
  fileName: string | null | undefined,
) {
  const normalizedRequestType = requestType?.trim();
  if (normalizedRequestType) return normalizedRequestType;

  const normalizedFileName = fileName?.trim();
  return normalizedFileName || 'Untitled document';
}

export function getWorkflowSubmissionDisplayTitle(submission: {
  request_title?: string | null;
  category?: string | null;
  other_document_type?: string | null;
  file_name?: string | null;
}) {
  const requestType = submission.request_title?.trim()
    || (submission.category
      ? getWorkflowDocumentTypeLabel(submission.category, submission.other_document_type)
      : null);
  return getWorkflowSubmissionTitle(requestType, submission.file_name);
}

export const OFFICE_RESPONSIBILITIES = {
  mandatory_approval_clearance: 'Mandatory Approval/Clearance',
  evaluation_verification: 'Evaluation/Verification',
  recommendation: 'Recommendation',
} as const;

export type OfficeResponsibility = keyof typeof OFFICE_RESPONSIBILITIES;
export type OfficeRoutingMode = 'sequential' | 'simultaneous';

export function isOfficeRole(role: string | null): role is OfficeRole {
  return role !== null && Object.prototype.hasOwnProperty.call(OFFICE_CONFIG, role);
}

export function getOfficeFileManagementPath(role: OfficeRole) {
  return `${OFFICE_CONFIG[role].path}/file_management`;
}

export function getOfficeArchivePath(role: OfficeRole) {
  return `${OFFICE_CONFIG[role].path}/archive`;
}

export function getOfficeNotificationsPath(role: OfficeRole) {
  return `${OFFICE_CONFIG[role].path}/notifications`;
}

export function getRoleHomePath(role: string | null) {
  if (role === 'system_admin') return '/workflow/admin';
  if (isOfficeRole(role)) return OFFICE_CONFIG[role].path;
  return '/workflow/user';
}
