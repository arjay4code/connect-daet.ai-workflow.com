export const TOURISM_OFFICE_ROLE = 'tourism_officer' as const;
export const TOURISM_OFFICE_LABEL = 'Daet Tourism Office';

export const TOURISM_OFFICE_DOCUMENT_TYPE_GROUPS = [
  {
    label: 'Tourism Statistics and Data',
    documentTypes: [
      'Request for Annual Tourism Statistics',
      'Request for Monthly Tourism Statistics',
      'Request for Quarterly Tourism Statistics',
      'Request for Local and Foreign Tourist Arrival Statistics',
      'Request for Tourist Arrival Statistics per Destination',
      'Request for Museum and Heritage Site Visitor Statistics',
      'Request for Festival and Special Event Tourist Statistics',
      'Request for List of Accommodation Establishments',
      'Request for List of Accredited Tourism Establishments',
    ],
  },
  {
    label: 'Tourism Profile and Information',
    documentTypes: [
      'Request for List of Tourist Attractions in Daet',
      'Request for Historical Background of Daet',
      'Request for Local Tourism Products and Services Information',
      'Request for Festivals and Cultural Activities Information',
      'Request for Tourist Destination Descriptions and Locations',
    ],
  },
  {
    label: 'Classification of Accommodation Establishments',
    documentTypes: [
      'Request for List of Accommodation Establishments Operating in Daet',
      'Request for List of Restaurants and Food Establishments',
      'Request for Primary and Secondary Tourism Enterprise Classification',
      'Request for Number of Registered or Accredited Tourism Establishments',
      'Request for Tourism Establishment Classification and Accreditation Status',
    ],
  },
] as const;

export const OFFICE_CONFIG = {
  tourism_officer: {
    label: TOURISM_OFFICE_LABEL,
    path: '/workflow/reviewer',
    legacyPath: '/workflow/tourism-office',
    documentTypeGroups: TOURISM_OFFICE_DOCUMENT_TYPE_GROUPS,
    categories: [
      ...TOURISM_OFFICE_DOCUMENT_TYPE_GROUPS.flatMap((group) => group.documentTypes),
      'Other',
    ],
  },
  municipal_treasurer: {
    label: "Municipal Treasurer's Office",
    path: '/workflow/reviewer',
    legacyPath: '/workflow/municipal-treasurer',
    categories: [
      'Request for Tax Clearance',
      'Request for Tax Declaration-related Certification',
      'Request for Business Tax Assessment',
      'Request for Real Property Tax Assessment',
      'Request for Real Property Tax Clearance',
      'Request for Official Receipt',
      'Request for Payment Certification',
      'Request for Tax Payment History',
      'Request for Refund',
      'Request for Tax Computation',
      'Request for Market Stall Rental Assessment',
      'Request for Business Permit Payment Assessment',
      'Request for Certification of No Tax Liability',
      'Request for Trust Fund or Deposit Certification',
      'Other',
    ],
  },
  mayor_office: {
    label: "Mayor's Office",
    path: '/workflow/reviewer',
    legacyPath: '/workflow/mayor',
    categories: [
      "Request for Mayor's Approval",
      "Request for Mayor's Signature",
      'Request for Certificate of Residency',
      'Request for Financial Assistance',
      'Request for Medical Assistance',
      'Request for Burial Assistance',
      'Request for Sponsorship',
      'Request for Use of Municipal Facilities',
      'Request for Equipment or Vehicle Use',
      'Request for Endorsement Letter',
      'Request for Authority to Conduct an Event',
      'Request for Certificate of Appreciation',
      'Request for Executive Clearance',
      'Request for Official Communication',
      'Other',
    ],
  },
  sangguniang_bayan: {
    label: 'Sangguniang Bayan Office',
    path: '/workflow/reviewer',
    legacyPath: '/workflow/sangguniang-bayan',
    categories: [
      'Request for Certified True Copy of Resolution',
      'Request for Certified True Copy of Ordinance',
      'Request for Legislative Records',
      'Request for Sponsorship or Resolution of Support',
      'Request for Passage of a Resolution',
      'Request for Ordinance',
      'Request for Legislative Endorsement',
      'Request for Certification of Legislative Action',
      'Request for Committee Hearing',
      'Request for Committee Investigation or Review',
      'Request for Certified Minutes of Session',
      'Request for Legislative Approval',
      'Request for Public Hearing',
      'Other',
    ],
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
