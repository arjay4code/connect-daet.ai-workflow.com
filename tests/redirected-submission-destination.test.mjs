import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL('../supabase/migrations/20261124201500_refresh_destination_after_redirection.sql', import.meta.url),
  'utf8',
);
const repairMigration = await readFile(
  new URL('../supabase/migrations/20261124212000_repair_active_redirected_submission_authority.sql', import.meta.url),
  'utf8',
);

test('redirecting a returned submission updates its current destination and decision authority', () => {
  const redirectFunction = migration.split(
    'create or replace function public.redirect_workflow_submission',
  )[1];

  assert.ok(redirectFunction, 'redirection RPC is replaced');
  assert.match(redirectFunction, /selected_office_role = target_office_role/);
  assert.match(redirectFunction, /initial_destination_role = target_office_role/);
  assert.match(
    redirectFunction,
    /final_decision_office_role = case\s+when target_office_role = 'tourism_officer' then null\s+else target_office_role\s+end/,
  );
  assert.match(redirectFunction, /Destination changed from/);
  assert.match(redirectFunction, /coalesce\(submission\.selected_office_role, 'unknown'\)/);
  assert.match(redirectFunction, /target_office_role \|\| '; document type: '/);
});

test('repair existing redirects without overriding a later forwarded route', () => {
  assert.match(repairMigration, /set_config\('app\.workflow_authorized_transition', 'on', true\)/);
  assert.match(repairMigration, /log\.action_type = 'SUBMISSION_REDIRECTED'/);
  assert.match(repairMigration, /initial_destination_role = eligible\.selected_office_role/);
  assert.match(repairMigration, /final_decision_office_role = case/);
  assert.match(repairMigration, /when eligible\.selected_office_role = 'tourism_officer' then null/);
  assert.match(repairMigration, /'OFFICE_ASSIGNMENT_FORWARDED_ONWARD'/);
  assert.match(repairMigration, /later_event\.created_at > redirected\.created_at/);
});
