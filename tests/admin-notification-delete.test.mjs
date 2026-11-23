import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('system admins can delete notifications shown in their global feed', async () => {
  const [adminPage, controls, migration] = await Promise.all([
    read('../app/(dashboard)/workflow/admin/notifications/page.tsx'),
    read('../components/WorkflowNotificationControls.tsx'),
    read('../supabase/migrations/20261123230000_allow_system_admins_to_delete_workflow_notifications.sql'),
  ]);

  assert.match(migration, /for delete[\s\S]*using \(public\.is_workflow_admin\(\)\)/);
  assert.match(adminPage, /\.from\('workflow_notifications'\)\s*\.delete\(\)\s*\.select\('id'\)/);
  assert.match(adminPage, /onClick=\{\(\) => void deleteNotification\(note\.notification_id\)\}/);
  assert.match(controls, /clearConfirmation = 'Permanently delete notifications addressed to your account/);
  assert.match(adminPage, /clearConfirmation="Permanently delete all workflow notifications/);
});
