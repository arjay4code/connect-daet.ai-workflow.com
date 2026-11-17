import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL('../supabase/migrations/20261115120000_submitter_change_request_outcomes.sql', import.meta.url),
  'utf8',
);
const submitterPage = await readFile(
  new URL('../app/(dashboard)/workflow/user/file_registry/[id]/page.tsx', import.meta.url),
  'utf8',
);
const adminPage = await readFile(
  new URL('../app/(dashboard)/workflow/admin/submissions/[id]/page.tsx', import.meta.url),
  'utf8',
);
const officePage = await readFile(
  new URL('../components/OfficeSubmissionDetail.tsx', import.meta.url),
  'utf8',
);
const userInbox = await readFile(
  new URL('../app/(dashboard)/workflow/user/page.tsx', import.meta.url),
  'utf8',
);
const officeInbox = await readFile(
  new URL('../components/OfficeDashboard.tsx', import.meta.url),
  'utf8',
);

test('revision submission locks and validates the owning submitter, request, and expected revision', () => {
  assert.match(migration, /submit_workflow_submission_revision\([\s\S]*expected_change_request_id uuid/);
  assert.match(migration, /actor_role is distinct from 'submitter'/);
  assert.match(migration, /where id = target_submission_id[\s\S]*and user_id = auth\.uid\(\)[\s\S]*for update/);
  assert.match(migration, /expected_revision_id is distinct from submission\.current_revision_id/);
  assert.match(migration, /request\.against_revision_id = submission\.current_revision_id/);
  assert.match(migration, /request\.status = 'open'/);
  assert.match(migration, /submission\.reopen_count <> 0/);
});

test('revision manifests enforce storage, size, file-count, change, and primary invariants', () => {
  assert.match(migration, /manifest_item\.storage_path !~ \([\s\S]*auth\.uid\(\)::text/);
  assert.match(migration, /from storage\.objects object[\s\S]*object\.bucket_id = 'workflow_uploads'/);
  assert.match(migration, /object\.metadata ->> 'size'/);
  assert.match(migration, /uploaded_object_size::bigint is distinct from manifest_item\.file_size/);
  assert.match(migration, /file_size > 10485760/);
  assert.match(migration, /changed_file_count < 1/);
  assert.match(migration, /current_primary_count <> 1/);
  assert.match(migration, /previous_file_count <> cardinality\(seen_previous_file_ids\)/);
  assert.match(migration, /same current file more than once/);
  assert.match(migration, /where prior\.storage_path = manifest_item\.storage_path/);
  assert.match(migration, /submitter_message text,\s*file_manifest jsonb\s*\)/);
  assert.doesNotMatch(migration, /file_manifest jsonb,\s*primary_file_url/);
});

test('revision transition preserves form and route fields while fulfilling the request atomically', () => {
  assert.match(migration, /'selected_office_role', submission\.selected_office_role/);
  assert.match(migration, /status = 'in_process'[\s\S]*current_revision_id = new_revision_id/);
  assert.match(migration, /reopen_count = 1/);
  assert.match(migration, /closure_reason = null[\s\S]*closed_at = null/);
  assert.match(migration, /set status = 'fulfilled'[\s\S]*fulfilled_by_revision_id = new_revision_id/);
  assert.match(migration, /'SUBMISSION_REOPENED'/);
  assert.match(migration, /insert into public\.workflow_submission_versions/);
  assert.doesNotMatch(migration, /delete from public\.workflow_submission_revisions/i);
  assert.doesNotMatch(migration, /delete from public\.workflow_revision_files/i);
});

test('permanent closure abandons the request and retains existing files', () => {
  assert.match(migration, /close_workflow_submission_permanently\([\s\S]*expected_change_request_id uuid/);
  assert.match(migration, /status = 'closed_by_submitter'/);
  assert.match(migration, /closure_reason = 'closed_by_submitter'/);
  assert.match(migration, /set status = 'abandoned'/);
  assert.match(migration, /'SUBMISSION_PERMANENTLY_CLOSED'/);
});

test('submitter editor exposes one-time revision actions and cleans up only failed uploads', () => {
  assert.match(submitterPage, /value="keep">Keep/);
  assert.match(submitterPage, /value="replace">Replace/);
  assert.match(submitterPage, /value="remove"/);
  assert.match(submitterPage, /Add supporting files/);
  assert.match(submitterPage, /submit_workflow_submission_revision/);
  assert.match(submitterPage, /close_workflow_submission_permanently/);
  assert.match(submitterPage, /Promise\.allSettled\(uploadPlan\.map/);
  assert.match(submitterPage, /remove\(uploadedPaths\)/);
  assert.match(submitterPage, /cleanupFailed/);
});

test('all detail views use current supporting files and show revision history', () => {
  for (const page of [submitterPage, officePage, adminPage]) {
    assert.match(page, /loadWorkflowSubmissionDetail/);
    assert.match(page, /setAttachments\(detail\.supportingFiles\)/);
    assert.match(page, /<WorkflowRevisionTimeline/);
  }
  assert.match(officePage, /Resubmitted/);
});

test('submitter and office inboxes mark submissions that have been resubmitted', () => {
  assert.match(userInbox, /reopen_count/);
  assert.match(officeInbox, /reopen_count/);
  assert.match(userInbox, />\s*Resubmitted\s*</);
  assert.match(officeInbox, />\s*Resubmitted\s*</);
});
