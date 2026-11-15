export type WorkflowActor =
  | 'submitter'
  | 'responsible_office'
  | 'assigned_office'
  | 'system_admin';

export type WorkflowAction =
  | 'clarify'
  | 'withdraw_submission'
  | 'redirect'
  | 'receive'
  | 'request_changes'
  | 'return_to_submitter'
  | 'complete_submission'
  | 'approve'
  | 'reject'
  | 'complete_assignment'
  | 'return_assignment'
  | 'forward'
  | 'revise_submission'
  | 'close_permanently';

interface SubmissionActionState {
  status: string;
  selected_office_role?: string | null;
  reopen_count?: number | null;
  has_open_change_request?: boolean;
  change_request_repair_needed?: boolean;
}

interface AssignmentActionState {
  status: string;
  office_role?: string | null;
}

const isChangesRequested = (status: string) =>
  status === 'changes_requested' || status === 'returned_for_requirements';

export function getAvailableActions(
  submission: SubmissionActionState,
  assignments: readonly AssignmentActionState[],
  actor: WorkflowActor,
): WorkflowAction[] {
  const status = submission.status.toLowerCase();
  const hasActiveAssignment = assignments.some(
    (assignment) =>
      (assignment.status === 'pending' || assignment.status === 'in_progress')
      && !(
        actor === 'responsible_office'
        && submission.selected_office_role
        && assignment.office_role === submission.selected_office_role
      ),
  );

  if (actor === 'system_admin') return [];

  if (actor === 'submitter') {
    if (isChangesRequested(status)) {
      const actions: WorkflowAction[] = ['clarify'];
      if (
        submission.has_open_change_request === true
        && submission.change_request_repair_needed !== true
        && (submission.reopen_count ?? 0) === 0
      ) {
        actions.push('revise_submission', 'close_permanently');
      }
      return actions;
    }
    if (status === 'submitted' || status === 'pending') return ['withdraw_submission'];
    if (status === 'returned') return ['redirect'];
    return [];
  }

  if (isChangesRequested(status)) return [];

  if (actor === 'responsible_office') {
    if (status === 'submitted' || status === 'pending_office') return ['receive'];
    if (status !== 'in_process' || hasActiveAssignment) {
      return status === 'in_process' ? ['return_to_submitter'] : [];
    }

    const actions: WorkflowAction[] = [
      'return_to_submitter',
      'complete_submission',
      'approve',
      'reject',
    ];
    if ((submission.reopen_count ?? 0) === 0) actions.push('request_changes');
    return actions;
  }

  if (status === 'in_process' && hasActiveAssignment) {
    return ['complete_assignment', 'return_assignment', 'forward'];
  }

  return [];
}
