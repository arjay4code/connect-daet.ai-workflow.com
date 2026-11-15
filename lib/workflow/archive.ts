export const ARCHIVE_ELIGIBLE_STATUSES = ['approved', 'completed'] as const;

export function isArchiveEligibleStatus(status: string | null | undefined) {
  const normalizedStatus = status?.toLowerCase();
  return ARCHIVE_ELIGIBLE_STATUSES.some((eligibleStatus) => eligibleStatus === normalizedStatus);
}
