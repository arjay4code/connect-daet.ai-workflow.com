import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

const feed = await readFile(
  new URL('../components/WorkflowNotificationFeed.tsx', import.meta.url),
  'utf8',
);
const controls = await readFile(
  new URL('../components/WorkflowNotificationControls.tsx', import.meta.url),
  'utf8',
);
const adminPage = await readFile(
  new URL('../app/(dashboard)/workflow/admin/notifications/page.tsx', import.meta.url),
  'utf8',
);
const userPage = await readFile(
  new URL('../app/(dashboard)/workflow/user/notifications/page.tsx', import.meta.url),
  'utf8',
);
const officePage = await readFile(
  new URL('../components/OfficeNotificationsPage.tsx', import.meta.url),
  'utf8',
);
const deletePolicy = await readFile(
  new URL('../supabase/migrations/20261117153500_allow_users_to_delete_own_notifications.sql', import.meta.url),
  'utf8',
);

test('notification pages no longer link to an archive and describe permanent deletion', () => {
  for (const source of [feed, controls, userPage, officePage, adminPage]) {
    assert.doesNotMatch(source, /archiveHref|archiveIconOnly|View notification archive|archive_workflow_notification/);
  }
  assert.match(feed, /Permanently delete all notifications/);
  assert.match(controls, /notification records only, not submissions or workflow history/);
});

test('users and offices delete only their own notification rows', () => {
  for (const source of [userPage, officePage]) {
    assert.match(source, /\.from\('workflow_notifications'\)\s*\.delete\(\)/);
    assert.match(source, /\.eq\('id', notificationId\)\s*\.eq\('recipient_id', user\.id\)/);
    assert.match(source, /\.eq\('recipient_id', user\.id\)/);
    assert.match(source, /submission and workflow history will not be deleted/);
    assert.doesNotMatch(source, /\.from\('workflow_submissions'\)\s*\.delete\(/);
  }
});

test('admin deletion is restricted to their own notifications', () => {
  assert.match(adminPage, /\.eq\('id', notificationId\)\s*\.eq\('recipient_id', user\.id\)/);
  assert.match(adminPage, /is_own_notification &&/);
  assert.match(adminPage, /The submission and workflow history will not be deleted/);
  assert.doesNotMatch(adminPage, /\.from\('workflow_submissions'\)\s*\.delete\(/);
  assert.match(deletePolicy, /on public\.workflow_notifications[\s\S]*?for delete[\s\S]*?using \(recipient_id = auth\.uid\(\)\)/);
});

test('notification archive routes are removed for every dashboard role', async () => {
  const routes = [
    '../app/(dashboard)/workflow/user/notifications/archive/page.tsx',
    '../app/(dashboard)/workflow/reviewer/notifications/archive/page.tsx',
    '../app/(dashboard)/workflow/admin/notifications/archive/page.tsx',
  ];
  await Promise.all(routes.map((route) => assert.rejects(access(new URL(route, import.meta.url)))));
});
