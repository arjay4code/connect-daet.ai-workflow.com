import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { isArchiveEligibleStatus } from '../lib/workflow/archive.ts';

test('only approved or completed submissions are archive-eligible', () => {
  assert.equal(isArchiveEligibleStatus('approved'), true);
  assert.equal(isArchiveEligibleStatus('COMPLETED'), true);
  assert.equal(isArchiveEligibleStatus('declined_by_office'), false);
  assert.equal(isArchiveEligibleStatus('withdrawn'), false);
  assert.equal(isArchiveEligibleStatus('pending_office'), false);
  assert.equal(isArchiveEligibleStatus(null), false);
});

test('admin archive view and archive RPC enforce final successful statuses', async () => {
  const [archivePage, migration] = await Promise.all([
    readFile(new URL('../app/(dashboard)/workflow/admin/archive/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/migrations/20261115103000_restrict_submission_archive_to_completed.sql', import.meta.url), 'utf8'),
  ]);
  assert.match(archivePage, /\.in\('status', \[\.\.\.ARCHIVE_ELIGIBLE_STATUSES\]\)/);
  assert.match(migration, /actor_role is distinct from 'system_admin'/);
  assert.match(migration, /lower\(coalesce\(result\.status, ''\)\) not in \('approved', 'completed'\)/);
});

test('office archive route uses the office-scoped completed-file view', async () => {
  const [route, workspace, layout, officeDashboard] = await Promise.all([
    readFile(new URL('../app/(dashboard)/workflow/reviewer/archive/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../components/ReviewerWorkspace.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../app/(dashboard)/workflow/layout.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../components/OfficeDashboard.tsx', import.meta.url), 'utf8'),
  ]);
  assert.match(route, /ReviewerWorkspace view="archive"/);
  assert.match(workspace, /OfficeDashboard role=\{role\} view="archive"/);
  assert.match(layout, /getOfficeArchivePath\(role\), label: 'Archive'/);
  assert.match(officeDashboard, /isArchiveEligibleStatus\(submission\.status\)/);
});
