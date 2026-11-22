import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  new URL('../supabase/migrations/20261122221000_add_tracking_number_document_retrieval.sql', import.meta.url),
  'utf8'
);
const retrievalPage = readFileSync(
  new URL('../app/(dashboard)/workflow/retrieval/page.tsx', import.meta.url),
  'utf8'
);
const permissionMigration = readFileSync(
  new URL('../supabase/migrations/20261122221500_grant_tracking_number_retrieval_rpc.sql', import.meta.url),
  'utf8'
);
const storageMigration = readFileSync(
  new URL('../supabase/migrations/20261122234000_require_complete_retrieval_storage_location.sql', import.meta.url),
  'utf8'
);
const releaseMigration = readFileSync(
  new URL('../supabase/migrations/20261122235000_persist_workflow_document_release.sql', import.meta.url),
  'utf8'
);

test('tracking-number retrieval only returns an active record assigned to the signed-in office', () => {
  assert.match(migration, /get_workflow_retrieval_by_tracking_number\(search_tracking_number text\)/);
  assert.match(migration, /actor_role not in \([\s\S]*'tourism_officer'[\s\S]*'municipal_treasurer'[\s\S]*'mayor_office'[\s\S]*'sangguniang_bayan'/);
  assert.match(migration, /submission\.tracking_number = upper\(btrim\(search_tracking_number\)\)/);
  assert.match(migration, /retrieval\.office_role = actor_role/);
  assert.match(migration, /retrieval\.status in \('active', 'released'\)/);
  assert.match(migration, /grant execute on function public\.get_workflow_retrieval_by_tracking_number\(text\)\s+to authenticated/);
});

test('retrieval page accepts tracking numbers while preserving QR lookup', () => {
  assert.match(retrievalPage, /Enter the tracking number/);
  assert.match(retrievalPage, /get_workflow_retrieval_by_tracking_number/);
  assert.match(retrievalPage, /get_workflow_retrieval_by_token/);
  assert.match(retrievalPage, /Document handover recorded and ready for claim\./);
});

test('a different-office lookup is shown in the page without triggering a console error overlay', () => {
  assert.match(retrievalPage, /isAssignedToDifferentOffice = error\.message\.includes/);
  assert.match(retrievalPage, /if \(!isAssignedToDifferentOffice\) \{\s*console\.error/);
  assert.match(retrievalPage, /This retrieval is not assigned to your office\. Check the tracking number or use a QR code/);
});

test('only locations that existed on lookup can be moved, and every save requires all fields', () => {
  assert.match(retrievalPage, /Move the document to a new storage location/);
  assert.match(retrievalPage, /checked={locationEditEnabled}/);
  assert.match(retrievalPage, /setLocation\(enabled \? EMPTY_LOCATION : \{/);
  assert.match(retrievalPage, /setCanMoveStoredLocation\(Boolean\([\s\S]*retrieval\.department_section\?\.trim\(\)[\s\S]*retrieval\.shelf\?\.trim\(\)[\s\S]*retrieval\.folder_box\?\.trim\(\)/);
  assert.match(retrievalPage, /const storageLocationLocked = canMoveStoredLocation && !locationEditEnabled/);
  assert.match(retrievalPage, /if \(\[location\.department_section, location\.shelf, location\.folder_box\]\.some/);
  assert.match(retrievalPage, /disabled={storageLocationLocked \|\| savingLocation}/);
  assert.match(retrievalPage, /Enter the department \/ room, shelf, and folder \/ box before saving the storage location/);
  assert.match(retrievalPage, /Location entered but not saved\. Select Save to record it\./);
  assert.match(retrievalPage, /const identityVerificationDisabled = [\s\S]*\(canMoveStoredLocation && !locationEditEnabled\)/);
  assert.match(retrievalPage, /disabled={identityVerificationDisabled}/);
  assert.match(retrievalPage, /setIdentityVerified\(false\)/);
  assert.match(storageMigration, /nullif\(btrim\(location_department_section\), ''\) is null/);
  assert.match(storageMigration, /nullif\(btrim\(location_shelf\), ''\) is null/);
  assert.match(storageMigration, /nullif\(btrim\(location_folder_box\), ''\) is null/);
});

test('release confirmation is single-use and displays database errors inline', () => {
  assert.match(retrievalPage, /if \(details\.released_at\) \{\s*setErrorMessage\('This document has already been handed over\.'/);
  assert.match(retrievalPage, /retrieval_status: 'released'/);
  assert.match(retrievalPage, /disabled={!identityVerified \|\| identityVerificationDisabled}/);
  assert.match(retrievalPage, /Handover already recorded/);
  assert.match(retrievalPage, /getErrorMessage\(error, 'Could not record this document release\.'/);
  assert.match(retrievalPage, /console\.warn\('Document release confirmation failed:', message\)/);
  assert.match(releaseMigration, /action_type = 'DOCUMENT_RELEASED'/);
  assert.match(releaseMigration, /retrieval\.status = 'released'[\s\S]*released_at = released_time[\s\S]*released_by = auth\.uid\(\)/);
  assert.match(releaseMigration, /This document has already been handed over/);
  assert.match(releaseMigration, /Save all three physical storage location fields before recording handover/);
});

test('authenticated officers receive execute permission for tracking-number lookup', () => {
  assert.match(permissionMigration, /grant execute on function public\.get_workflow_retrieval_by_tracking_number\(text\)\s+to authenticated/);
  assert.match(permissionMigration, /has_function_privilege\([\s\S]*'authenticated'[\s\S]*'EXECUTE'/);
});
