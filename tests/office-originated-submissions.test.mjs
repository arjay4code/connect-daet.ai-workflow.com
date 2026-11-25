import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL('../supabase/migrations/20261125120000_enable_office_requester_submissions.sql', import.meta.url),
  'utf8',
);
const forwardingMigration = await readFile(
  new URL('../supabase/migrations/20261125141800_prevent_office_request_self_routing.sql', import.meta.url),
  'utf8',
);
const officeAccessMigration = await readFile(
  new URL('../supabase/migrations/20261125144700_restore_direct_office_submission_access.sql', import.meta.url),
  'utf8',
);
const workflowLayout = await readFile(
  new URL('../app/(dashboard)/workflow/layout.tsx', import.meta.url),
  'utf8',
);
const workflowProxy = await readFile(
  new URL('../proxy.ts', import.meta.url),
  'utf8',
);
const uploadPage = await readFile(
  new URL('../app/(dashboard)/workflow/user/upload/page.tsx', import.meta.url),
  'utf8',
);
const requesterDashboard = await readFile(
  new URL('../app/(dashboard)/workflow/user/page.tsx', import.meta.url),
  'utf8',
);
const requesterDetail = await readFile(
  new URL('../app/(dashboard)/workflow/user/file_registry/[id]/page.tsx', import.meta.url),
  'utf8',
);
const officeNotifications = await readFile(
  new URL('../components/OfficeNotificationsPage.tsx', import.meta.url),
  'utf8',
);
const documentMessaging = await readFile(
  new URL('../components/DocumentMessaging.tsx', import.meta.url),
  'utf8',
);
const officeDetail = await readFile(
  new URL('../components/OfficeSubmissionDetail.tsx', import.meta.url),
  'utf8',
);

test('office accounts reuse the requester form while ownership remains tied to auth.uid()', () => {
  assert.match(workflowLayout, /href: '\/workflow\/user\/upload', label: 'New Request'/);
  assert.match(workflowLayout, /href: '\/workflow\/user', label: 'My Requests'/);
  assert.match(workflowProxy, /pathname === '\/workflow\/user'/);
  assert.match(workflowProxy, /pathname === '\/workflow\/user\/upload'/);
  assert.match(workflowProxy, /\\\/workflow\\\/user\\\/file_registry\\\/\[\^\/\]\+\$/);
  assert.match(workflowProxy, /!\(isOfficeRole\(role\) && isOfficeRequesterPath\)/);
  assert.match(uploadPage, /create_workflow_submission/);
  assert.match(uploadPage, /user\.id/);
  assert.match(requesterDashboard, /\.eq\('user_id', user\.id\)/);
  assert.match(migration, /actor_role not in \([\s\S]*'tourism_officer'[\s\S]*'municipal_treasurer'[\s\S]*'mayor_office'[\s\S]*'sangguniang_bayan'/);
});

test('office requester actions and retrieval remain owner-scoped and cannot route to the same office', () => {
  for (const action of [
    'submit_workflow_submission_revision',
    'close_workflow_submission_permanently',
    'redirect_workflow_submission',
    'withdraw_workflow_submission',
  ]) {
    assert.ok(migration.includes(`public.${action}(`), `${action} must be covered by the migration`);
  }
  assert.match(migration, /position\('and user_id = auth\.uid\(\)' in function_definition\) = 0/);
  assert.match(migration, /submission_office_role = actor_role/);
  assert.match(migration, /target_office_role = actor_role/);
  assert.match(requesterDetail, /redirectOffice === accountRole/);
  assert.match(migration, /public\.get_workflow_retrieval_qr\(uuid\)/);
  assert.match(migration, /public\.create_workflow_retrieval_qr\(uuid\)/);
  assert.match(migration, /and submission\.user_id = auth\.uid\(\)/);
});

test('offices cannot forward a request to the office that originated it', () => {
  assert.equal((officeDetail.match(/office !== originatingOfficeRole/g) ?? []).length, 2);
  assert.match(forwardingMigration, /requester_role = submission\.user_id|profile\.id = submission\.user_id/);
  assert.match(forwardingMigration, /target_office_role = requester_role/);
});

test('only the destination or an assigned office can open an office submission', () => {
  assert.match(officeAccessMigration, /public\.current_profile_role\(\) in \([\s\S]*'tourism_officer'[\s\S]*'municipal_treasurer'[\s\S]*'mayor_office'[\s\S]*'sangguniang_bayan'/);
  assert.match(officeAccessMigration, /submission\.selected_office_role = public\.current_profile_role\(\)/);
  assert.match(officeAccessMigration, /submission\.initial_destination_role = public\.current_profile_role\(\)/);
  assert.match(officeAccessMigration, /step\.office_role = public\.current_profile_role\(\)/);
});

test('requester notifications open the owner view and do not award office accounts requester points', () => {
  assert.match(officeNotifications, /notification\.user_id === user\.id/);
  assert.match(officeNotifications, /\/workflow\/user\/file_registry\//);
  assert.match(migration, /new\.recipient_id = submission_user_id/);
  assert.match(migration, /requester\.role = 'submitter'/);
  assert.match(requesterDashboard, /role === 'submitter'/);
});

test('existing recommendation forwarding remains unchanged in the interface', () => {
  assert.doesNotMatch(documentMessaging, /INTER_OFFICE_REQUEST_TYPES|structured request|Inter-office request details/);
  assert.match(officeDetail, /buttonLabel: 'Forward'/);
  assert.match(officeDetail, /for a recommendation/);
  assert.match(migration, /Recommendation/);
});
