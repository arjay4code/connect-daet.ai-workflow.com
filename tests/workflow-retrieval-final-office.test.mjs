import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  new URL('../supabase/migrations/20261123002000_assign_retrieval_qr_to_completing_office.sql', import.meta.url),
  'utf8'
);

test('QR ownership follows the office that completed the request', () => {
  assert.match(migration, /completing_profile\.id = coalesce\(submission\.final_decision_by, submission\.closed_by\)/);
  assert.match(migration, /completing_profile\.role in \([\s\S]*'tourism_officer'[\s\S]*'municipal_treasurer'[\s\S]*'mayor_office'[\s\S]*'sangguniang_bayan'/);
  assert.match(migration, /submission\.final_decision_office_role/);
  assert.match(migration, /set office_role = target_office_role/);
  assert.doesNotMatch(migration, /step\.status = 'approved'/);
});

test('existing active retrieval records are reassigned without changing their QR tokens', () => {
  assert.match(migration, /update public\.workflow_document_retrievals retrieval/);
  assert.match(migration, /retrieval\.status = 'active'/);
  assert.match(migration, /retrieval\.office_role is distinct from completed_submissions\.office_role/);
  assert.match(migration, /qr_token = gen_random_uuid\(\)/);
  assert.match(migration, /if retrieval\.status = 'released' then/);
});

test('QR generation remains restricted to the request owner and authenticated submitter', () => {
  assert.match(migration, /current_profile_role\(\), ''\) <> 'submitter'/);
  assert.match(migration, /submission\.user_id = auth\.uid\(\)/);
  assert.match(migration, /grant execute on function public\.create_workflow_retrieval_qr\(uuid\)\s+to authenticated/);
});
