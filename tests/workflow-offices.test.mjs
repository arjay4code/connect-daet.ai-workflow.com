import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  OFFICE_CONFIG,
  isOfficeRole,
} from '../lib/workflow/offices.ts';

test('office configuration contains routing metadata, not document type catalogues', () => {
  assert.deepEqual(Object.keys(OFFICE_CONFIG).sort(), [
    'mayor_office',
    'municipal_treasurer',
    'sangguniang_bayan',
    'tourism_officer',
  ]);
  assert.equal(OFFICE_CONFIG.tourism_officer.label, 'Daet Tourism Office');
  assert.equal(OFFICE_CONFIG.municipal_treasurer.label, "Municipal Treasurer's Office");
  assert.ok(Object.values(OFFICE_CONFIG).every((office) => !('categories' in office)));
  assert.ok(isOfficeRole('mayor_office'));
  assert.equal(isOfficeRole('unknown_office'), false);
});

test('office seed migrations retain the protected Other custom request type', async () => {
  const seedFiles = [
    '20261112140000_add_mayor_office_request_types.sql',
    '20261112144000_add_municipal_treasurer_request_types.sql',
    '20261112150000_add_sangguniang_bayan_request_types.sql',
    '20261112150000_seed_tourism_office_document_types.sql',
  ];

  for (const fileName of seedFiles) {
    const seedFile = new URL(`../supabase/migrations/${fileName}`, import.meta.url);
    const migration = await readFile(seedFile, 'utf8');
    assert.match(migration, /'Other'\)/, `${fileName} should seed the Other custom option`);
  }
});
