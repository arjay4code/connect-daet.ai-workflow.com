import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  new URL('../supabase/migrations/20261117132400_allow_tourism_assigned_retrieval_qr.sql', import.meta.url),
  'utf8'
);

test('Tourism can own retrieval QR records and scan as an authorized office', () => {
  assert.match(migration, /office_role in \([\s\S]*?'tourism_officer'/);
  assert.match(migration, /actor_role not in \([\s\S]*?'tourism_officer'/);
});

test('retrieval QR access remains restricted to its assigned office', () => {
  assert.match(migration, /target_retrieval\.office_role <> actor_role/);
});
