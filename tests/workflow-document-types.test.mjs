import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { getWorkflowDocumentTypesForOffice } from '../lib/workflow/document-types.ts';

const migrationUrl = new URL(
  '../supabase/migrations/20261123002000_manage_workflow_document_types.sql',
  import.meta.url,
);

test('document type options are filtered by the selected destination office', () => {
  const catalogue = [
    { office_role: 'mayor_office', document_type: 'Other' },
    { office_role: 'municipal_treasurer', document_type: 'Tax Clearance' },
    { office_role: 'mayor_office', document_type: 'Residency Certificate' },
  ];

  assert.deepEqual(
    getWorkflowDocumentTypesForOffice(catalogue, 'mayor_office'),
    ['Other', 'Residency Certificate'],
  );
  assert.deepEqual(
    getWorkflowDocumentTypesForOffice(catalogue, 'municipal_treasurer'),
    ['Tax Clearance'],
  );
  assert.deepEqual(getWorkflowDocumentTypesForOffice(catalogue, ''), []);
});

test('catalogue management is admin-only and protects Other and referenced types', async () => {
  const migration = await readFile(migrationUrl, 'utf8');
  const deleteFunction = migration.split(
    'create or replace function public.delete_workflow_office_document_type',
  )[1]?.split('$$;')[0];

  assert.equal(
    (migration.match(/current_profile_role\(\) is distinct from 'system_admin'/g) ?? []).length,
    2,
  );
  assert.match(migration, /lower\(normalized_document_type\) = 'other'/);
  assert.ok(deleteFunction);
  assert.match(deleteFunction, /workflow_final_decision_authorities/);
  assert.match(deleteFunction, /workflow_submissions/);
  assert.match(deleteFunction, /delete from public\.workflow_office_document_types/);
  assert.doesNotMatch(deleteFunction, /delete from public\.workflow_submissions/);
});
