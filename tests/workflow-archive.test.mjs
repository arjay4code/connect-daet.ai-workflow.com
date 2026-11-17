import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { isArchiveEligibleStatus } from '../lib/workflow/archive.ts';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('only approved or completed submissions are archive-eligible', () => {
  assert.equal(isArchiveEligibleStatus('approved'), true);
  assert.equal(isArchiveEligibleStatus('COMPLETED'), true);
  assert.equal(isArchiveEligibleStatus('declined_by_office'), false);
  assert.equal(isArchiveEligibleStatus('withdrawn'), false);
  assert.equal(isArchiveEligibleStatus('pending_office'), false);
  assert.equal(isArchiveEligibleStatus(null), false);
});

test('archive RPC returns eligible records within the authenticated role scope', async () => {
  const migration = await read('../supabase/migrations/20261117090000_add_role_scoped_workflow_archives.sql');
  assert.match(migration, /public\.is_active_workflow_account\(\)/);
  assert.match(migration, /lower\(submission\.status\) in \('approved', 'completed'\)/);
<<<<<<< HEAD
=======
  assert.match(migration, /submission\.file_size::bigint/);
>>>>>>> f43d4a39e6b0d9fa38d584cc27141cec99e315c4
  assert.match(migration, /actor_role = 'submitter' and submission\.user_id = auth\.uid\(\)/);
  assert.match(migration, /actor_role = 'system_admin' and archive_office_role is null/);
  assert.match(migration, /archive_office_role is distinct from actor_role/);
  assert.match(migration, /submission\.selected_office_role = archive_office_role/);
  assert.match(migration, /submission\.initial_destination_role = archive_office_role/);
  assert.match(migration, /step\.office_role = archive_office_role/);
  assert.match(migration, /step\.assigned_by_role = archive_office_role/);
  assert.doesNotMatch(migration, /archived_at is not null/);
  assert.match(migration, /revoke all on function public\.get_workflow_archive\(text\) from public, anon/);
});

test('user, office, and admin registry archive buttons open role-scoped archive pages', async () => {
  const [adminRoute, userRoute, officeRoute, workspace, layout, userRegistry, officeDashboard, adminRegistry, archive] = await Promise.all([
    read('../app/(dashboard)/workflow/admin/archive/page.tsx'),
    read('../app/(dashboard)/workflow/user/archive/page.tsx'),
    read('../app/(dashboard)/workflow/reviewer/archive/page.tsx'),
    read('../components/ReviewerWorkspace.tsx'),
    read('../app/(dashboard)/workflow/layout.tsx'),
    read('../app/(dashboard)/workflow/user/file_registry/page.tsx'),
    read('../components/OfficeDashboard.tsx'),
    read('../app/(dashboard)/workflow/admin/submissions/page.tsx'),
    read('../components/WorkflowArchive.tsx'),
  ]);
  assert.match(adminRoute, /WorkflowArchive role="system_admin"/);
  assert.match(userRoute, /WorkflowArchive role="submitter"/);
  assert.match(officeRoute, /ReviewerWorkspace view="archive"/);
  assert.match(workspace, /WorkflowArchive role=\{role\} adminOfficeView=\{currentRole === 'system_admin'\}/);
  assert.doesNotMatch(layout, /label: 'Archive'/);
  assert.match(userRegistry, /href="\/workflow\/user\/archive"/);
  assert.match(officeDashboard, /href=\{officeArchivePath\}/);
  assert.match(officeDashboard, /getOfficeArchivePath\(role\)/);
  assert.match(adminRegistry, /href="\/workflow\/admin\/archive"/);
  assert.match(archive, /get_workflow_archive/);
  assert.match(archive, /getOfficeFileManagementPath\(role\)\}\/\$\{submissionId\}/);
});
