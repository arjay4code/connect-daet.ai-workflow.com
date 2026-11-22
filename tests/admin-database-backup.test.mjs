import assert from 'node:assert/strict';
import test from 'node:test';
import {
  APP_BACKUP_TABLES,
  isAppBackupBucket,
  isAppBackupTable,
  isSafeStoragePath,
} from '../lib/workflow/database-backup.ts';

test('database backups only allowlisted application tables and storage buckets', () => {
  assert.equal(isAppBackupTable('workflow_submissions'), true);
  assert.equal(isAppBackupTable('workflow_assignments'), false);
  assert.equal(APP_BACKUP_TABLES.includes('workflow_assignments'), false);
  assert.equal(isAppBackupTable('auth.users'), false);
  assert.equal(isAppBackupBucket('workflow_uploads'), true);
  assert.equal(isAppBackupBucket('avatars'), false);
});

test('backup storage paths reject traversal and malformed segments', () => {
  assert.equal(isSafeStoragePath('submissions/2026/request.pdf'), true);
  assert.equal(isSafeStoragePath('../private/file.pdf'), false);
  assert.equal(isSafeStoragePath('folder/../file.pdf'), false);
  assert.equal(isSafeStoragePath('folder//file.pdf'), false);
  assert.equal(isSafeStoragePath('folder\\file.pdf'), false);
});
