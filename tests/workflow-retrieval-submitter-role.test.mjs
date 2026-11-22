import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  new URL('../supabase/migrations/20261122160500_fix_submitter_retrieval_qr_role.sql', import.meta.url),
  'utf8'
);

test('retrieval QR functions authorize the current submitter role', () => {
  assert.match(migration, /get_workflow_retrieval_qr\(uuid\)/);
  assert.match(migration, /create_workflow_retrieval_qr\(uuid\)/);
  assert.match(migration, /current_profile_role\(\), ''\) <> 'submitter'/);
});

test('QR generation records the caller profile role instead of a legacy role literal', () => {
  assert.match(migration, /public\.current_profile_role\(\), 'QR_GENERATED'/);
});
