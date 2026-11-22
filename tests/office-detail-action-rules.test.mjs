import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const detail = await readFile(
  new URL('../components/OfficeSubmissionDetail.tsx', import.meta.url),
  'utf8',
);
const messaging = await readFile(
  new URL('../components/DocumentMessaging.tsx', import.meta.url),
  'utf8',
);

const actionBlock = (value) => {
  const responsibleActions = detail.match(/const responsibleOfficeActions = \[([\s\S]*?)\n {2}\];/)?.[1] ?? '';
  return responsibleActions.match(new RegExp(`value: '${value}',([\\s\\S]*?)(?=\\n {4}\\},|$)`))?.[1] ?? '';
};

test('approve and reject follow the decision RPC rules: In Process and the decision office only', () => {
  assert.match(detail, /const decisionOfficeRole = sub\.final_decision_office_role \?\? initialDestinationRole;/);
  assert.match(detail, /decisionStatusReason = sub\.status !== 'in_process'/);
  for (const value of ['approve', 'reject']) {
    const block = actionBlock(value);
    assert.ok(block, `${value} action exists`);
    assert.match(block, /pendingAssignmentReason \|\| decisionStatusReason \|\| decisionAuthorityReason/);
  }
});

test('the action box is not pre-filled with old office comments', () => {
  assert.doesNotMatch(detail, /initialMessage: processingNote/);
  assert.doesNotMatch(detail, /const processingNote =/);
});

test('the action list opens on the first available action', () => {
  assert.match(detail, /initialAction = \(actionsByRecipient\[initialRecipient\] \?\? \[\]\)\.find\(\(action\) => !action\.unavailableReason\)/);
});

test('Request changes remains available only with a verified current revision and resolved additional assignments', () => {
  const requestChanges = actionBlock('request_changes');
  assert.ok(requestChanges, 'Request changes action exists');
  assert.match(requestChanges, /!sub\.current_revision_id/);
  assert.match(requestChanges, /!availableOfficeActions\.includes\('request_changes'\)/);
  assert.match(detail, /setAttachments\(detail\.supportingFiles\)/);
});

test('redirection is unavailable while forwarded assignments are active', () => {
  const returnForRedirection = actionBlock('return_to_submitter');
  assert.ok(returnForRedirection, 'Return for redirection action exists');
  assert.match(returnForRedirection, /pendingAssignmentReason/);
  assert.match(returnForRedirection, /availableOfficeActions\.includes\('return_to_submitter'\)/);
});

test('withdrawal is offered only for unreceived assignments while the submission is in process', async () => {
  assert.match(detail, /step\.office_role === officeRole && step\.status === 'pending'/);
  assert.match(detail, /sub\.status !== 'in_process'/);
  const migration = await readFile(
    new URL('../supabase/migrations/20261122234000_restrict_return_and_assignment_withdrawal.sql', import.meta.url),
    'utf8',
  );
  assert.match(migration, /and step\.status = 'pending'/);
  assert.match(migration, /Withdraw active forwarded office assignments before returning this submission for redirection/);
  assert.match(migration, /submission\.status <> 'in_process'/);
  const withdrawFunction = migration.split(
    'create or replace function public.withdraw_workflow_assignment',
  )[1];
  assert.ok(withdrawFunction, 'withdrawal RPC replacement exists');
  assert.doesNotMatch(withdrawFunction, /step\.status in \('pending', 'in_progress'\)/);
});

test('returned submissions close the office composer and submitter conversation', () => {
  assert.match(detail, /const isReturned = sub\.status === 'returned';/);
  assert.match(detail, /const composerClosed = isChangesRequested \|\| isCompleted \|\| isRejected \|\| isWithdrawn \|\| isReturned \|\| historicalRecipientView;/);
  assert.match(detail, /!isChangesRequested && !isCompleted && !isRejected && !isWithdrawn && !isReturned && isResponsibleOffice/);
  assert.match(detail, /This submission was returned to the submitter for redirection\./);
});

test('a plain Complete is not shown as an approval decision', () => {
  assert.match(detail, /const isApprovalDecision = sub\.status === 'approved';/);
  assert.match(detail, /: 'Submission completed',/);
});

test('back navigation returns to the office file list', () => {
  assert.match(detail, /router\.push\(getOfficeFileManagementPath\(role\)\)/);
});

test('workflow actions report a specific success message', () => {
  assert.match(messaging, /successMessage\?: string;/);
  assert.match(messaging, /setNotice\(action\.successMessage \?\? `\$\{action\.label\} completed\.`\)/);
  const successMessages = detail.match(/successMessage: /g) ?? [];
  assert.ok(successMessages.length >= 9, `expected success messages on every action, found ${successMessages.length}`);
});
