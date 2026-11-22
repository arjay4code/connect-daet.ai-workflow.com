import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const documentMessaging = readFileSync(
  new URL('../components/DocumentMessaging.tsx', import.meta.url),
  'utf8'
);
const officeSubmissionDetail = readFileSync(
  new URL('../components/OfficeSubmissionDetail.tsx', import.meta.url),
  'utf8'
);
const userFileDetail = readFileSync(
  new URL('../app/(dashboard)/workflow/user/file_registry/[id]/page.tsx', import.meta.url),
  'utf8'
);

test('workflow conversation and detail views use the shared account instead of competing auth reads', () => {
  for (const source of [documentMessaging, officeSubmissionDetail, userFileDetail]) {
    assert.match(source, /useWorkflowAccount\(\)/);
    assert.doesNotMatch(source, /supabase\.auth\.getUser\(/);
  }

  assert.match(documentMessaging, /if \(!accountReady\) return/);
  assert.match(officeSubmissionDetail, /if \(!accountReady\) return/);
});
