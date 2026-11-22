import assert from 'node:assert/strict';
import test from 'node:test';
import { getAvailableActions } from '../lib/workflow/action-availability.ts';

test('Changes Requested submitter outcomes require a valid open request and no repair flag', () => {
  for (const status of ['changes_requested', 'returned_for_requirements']) {
    assert.deepEqual(getAvailableActions({ status }, [], 'submitter'), ['clarify']);
    assert.deepEqual(getAvailableActions({ status }, [], 'responsible_office'), []);
    assert.deepEqual(getAvailableActions({ status }, [{ status: 'in_progress' }], 'assigned_office'), []);
    assert.deepEqual(getAvailableActions({ status }, [], 'system_admin'), []);
  }

  assert.deepEqual(
    getAvailableActions(
      {
        status: 'changes_requested',
        reopen_count: 0,
        has_open_change_request: true,
        change_request_repair_needed: false,
      },
      [],
      'submitter',
    ),
    ['clarify', 'revise_submission', 'close_permanently'],
  );
  assert.deepEqual(
    getAvailableActions(
      {
        status: 'changes_requested',
        reopen_count: 0,
        has_open_change_request: true,
        change_request_repair_needed: true,
      },
      [],
      'submitter',
    ),
    ['clarify'],
  );
  assert.deepEqual(
    getAvailableActions(
      { status: 'changes_requested', reopen_count: 1, has_open_change_request: true },
      [],
      'submitter',
    ),
    ['clarify'],
  );
});

test('responsible-office actions respect status, pending assignments, and reopen history', () => {
  assert.deepEqual(
    getAvailableActions({ status: 'submitted' }, [], 'responsible_office'),
    ['receive'],
  );

  const inProcessActions = getAvailableActions({ status: 'in_process', reopen_count: 0 }, [], 'responsible_office');
  assert.ok(inProcessActions.includes('request_changes'));
  assert.ok(inProcessActions.includes('complete_submission'));
  assert.ok(inProcessActions.includes('return_to_submitter'));

  const ownActiveAssignmentActions = getAvailableActions(
    {
      status: 'in_process',
      selected_office_role: 'municipal_treasurer',
      reopen_count: 0,
    },
    [{ status: 'in_progress', office_role: 'municipal_treasurer' }],
    'responsible_office',
  );
  assert.ok(ownActiveAssignmentActions.includes('request_changes'));
  assert.ok(ownActiveAssignmentActions.includes('complete_submission'));

  const reopenedActions = getAvailableActions({ status: 'in_process', reopen_count: 1 }, [], 'responsible_office');
  assert.ok(!reopenedActions.includes('request_changes'));

  const assignedActions = getAvailableActions(
    {
      status: 'in_process',
      selected_office_role: 'municipal_treasurer',
      reopen_count: 0,
    },
    [{ status: 'pending', office_role: 'mayor_office' }],
    'responsible_office',
  );
  assert.deepEqual(assignedActions, []);
  assert.ok(!assignedActions.includes('request_changes'));
  assert.ok(!assignedActions.includes('complete_submission'));
  assert.ok(!assignedActions.includes('return_to_submitter'));
});

test('submitter actions do not reopen Changes Requested or alter unrelated terminal states', () => {
  assert.deepEqual(getAvailableActions({ status: 'returned' }, [], 'submitter'), ['redirect']);
  assert.deepEqual(getAvailableActions({ status: 'completed' }, [], 'submitter'), []);
  assert.deepEqual(getAvailableActions({ status: 'submitted' }, [], 'submitter'), ['withdraw_submission']);
});
