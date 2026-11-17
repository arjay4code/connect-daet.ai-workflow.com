import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL('../supabase/migrations/20261118120000_fix_forwarded_message_attachment_upload.sql', import.meta.url),
  'utf8',
);

test('pre-RPC forwarding uploads allow only the active office assignment', () => {
  assert.match(migration, /cardinality\(string_to_array\(object_name, '\/'\)\) = 5/);
  assert.match(migration, /eligible_submission\.status = 'in_process'/);
  assert.match(migration, /actor\.is_active/);
  assert.match(migration, /account\.banned_until is null/);
  assert.match(migration, /actor\.role in \(/);
  assert.match(migration, /assigned_step\.status in \('pending', 'in_progress'\)/);
  assert.doesNotMatch(
    migration,
    /can_write_workflow_message_conversation\(\s*eligible_submission\.id,\s*null/,
  );
});
