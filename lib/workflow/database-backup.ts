export const APP_BACKUP_FORMAT = 'connect-daet-app-backup';
export const APP_BACKUP_VERSION = 1;
export const APP_BACKUP_MAX_BYTES = 250 * 1024 * 1024;
export const APP_BACKUP_PAGE_SIZE = 300;
export const APP_RESTORE_CHUNK_SIZE = 50;

export const APP_BACKUP_TABLES = [
  'profiles',
  'workflow_tracking_sequences',
  'workflow_office_document_types',
  'workflow_submissions',
  'workflow_routing_plans',
  'workflow_routing_steps',
  'workflow_submission_attachments',
  'workflow_submission_versions',
  'workflow_submission_revisions',
  'workflow_revision_files',
  'workflow_change_requests',
  'workflow_audit_logs',
  'workflow_notifications',
  'workflow_notification_dismissals',
  'workflow_notification_archives',
  'workflow_messages',
  'workflow_message_attachments',
  'workflow_message_reads',
  'workflow_email_outbox',
  'workflow_email_attempts',
  'workflow_email_provider_events',
  'workflow_document_retrievals',
  'workflow_document_retrieval_events',
  'workflow_final_decision_authorities',
  'workflow_submission_reward_ledger',
  'system_activity_events',
] as const;

export const APP_BACKUP_BUCKETS = [
  'workflow_uploads',
  'workflow_message_attachments',
] as const;

export type AppBackupTable = (typeof APP_BACKUP_TABLES)[number];
export type AppBackupBucket = (typeof APP_BACKUP_BUCKETS)[number];

export function isAppBackupTable(value: string): value is AppBackupTable {
  return APP_BACKUP_TABLES.some((table) => table === value);
}

export function isAppBackupBucket(value: string): value is AppBackupBucket {
  return APP_BACKUP_BUCKETS.some((bucket) => bucket === value);
}

export function isSafeStoragePath(value: string) {
  return value.length > 0
    && value.length <= 2048
    && !value.startsWith('/')
    && !value.includes('\\')
    && value.split('/').every((part) => part.length > 0 && part !== '.' && part !== '..');
}
