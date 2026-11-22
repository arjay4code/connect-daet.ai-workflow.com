export interface WorkflowReportTimingRow {
  status: string;
  created_at: string;
  updated_at: string;
  verified_at: string | null;
  office_reviewed_at: string | null;
  approved_at: string | null;
  completed_at: string | null;
  auditLogs: { action_type: string; created_at: string }[];
}

function timestamp(value: string | null | undefined) {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function earliestEventTimestamp(
  row: WorkflowReportTimingRow,
  actionTypes: readonly string[],
) {
  return row.auditLogs
    .filter((event) => actionTypes.includes(event.action_type))
    .map((event) => timestamp(event.created_at))
    .filter((value): value is number => value !== null)
    .sort((first, second) => first - second)[0] ?? null;
}

function durationHours(start: number | null, end: number | null) {
  if (start === null || end === null || end < start) return null;
  return (end - start) / 3_600_000;
}

function average(values: number[]) {
  return values.length === 0
    ? null
    : values.reduce((total, value) => total + value, 0) / values.length;
}

export function calculateWorkflowReportAverages(rows: readonly WorkflowReportTimingRow[]) {
  const timeToReview: number[] = [];
  const reviewToDecision: number[] = [];
  const timeToCompletion: number[] = [];

  rows.forEach((row) => {
    const isCompleted = row.status === 'completed' || row.status === 'approved';
    const submittedAt = timestamp(row.created_at)
      ?? earliestEventTimestamp(row, ['SUBMITTED']);
    const reviewedAt = timestamp(row.office_reviewed_at)
      ?? timestamp(row.verified_at)
      ?? earliestEventTimestamp(row, [
        'VERIFICATION_PASSED',
        'APPROVER_APPROVED',
        'ADMIN_VERIFIED',
        'OFFICE_REVIEW_COMPLETED',
      ]);
    const completedAt = timestamp(row.completed_at)
      ?? earliestEventTimestamp(row, ['WORKFLOW_COMPLETED', 'SUBMISSION_CLOSED', 'MAYOR_APPROVED'])
      ?? (isCompleted ? timestamp(row.updated_at) : null);
    const decisionAt = timestamp(row.approved_at)
      ?? earliestEventTimestamp(row, ['FINAL_APPROVAL', 'OFFICE_FINAL_DECISION', 'MAYOR_APPROVED'])
      ?? (isCompleted ? completedAt : null);

    const reviewDuration = durationHours(submittedAt, reviewedAt);
    if (reviewDuration !== null) timeToReview.push(reviewDuration);

    const decisionDuration = durationHours(reviewedAt, decisionAt);
    if (decisionDuration !== null) reviewToDecision.push(decisionDuration);

    if (isCompleted) {
      const completionDuration = durationHours(submittedAt, completedAt);
      if (completionDuration !== null) timeToCompletion.push(completionDuration);
    }
  });

  return {
    timeToReview: average(timeToReview),
    reviewToDecision: average(reviewToDecision),
    timeToCompletion: average(timeToCompletion),
  };
}

export function formatReportDuration(hours: number | null) {
  if (hours === null || !Number.isFinite(hours) || hours < 0) return 'No data yet';

  const seconds = Math.round(hours * 3600);
  if (seconds < 60) return `${seconds} sec`;
  if (hours < 1) return `${(hours * 60).toFixed(1)} min`;
  if (hours < 24) return `${hours.toFixed(1)} h`;
  return `${(hours / 24).toFixed(1)} days`;
}
