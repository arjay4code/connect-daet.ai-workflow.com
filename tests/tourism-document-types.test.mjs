import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL(
  '../supabase/migrations/20261112150000_seed_tourism_office_document_types.sql',
  import.meta.url,
);

test('Tourism document types are initialized in the database catalogue with protected Other', async () => {
  const migration = await readFile(migrationUrl, 'utf8');

  assert.match(migration, /insert into public\.workflow_office_document_types/);
  assert.match(migration, /\('tourism_officer', 'Other'\)/);
  assert.match(migration, /on conflict \(office_role, document_type\) do nothing/);
});
