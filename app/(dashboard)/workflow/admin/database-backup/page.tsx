'use client';
import { logClientError } from '@/lib/clientLogger';

import { useMemo, useState } from 'react';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { createClient } from '@/lib/supabase/client';
import Icon from '@/components/ui/Icon';
import PageHero from '@/components/ui/PageHero';
import {
  APP_BACKUP_FORMAT,
  APP_BACKUP_MAX_BYTES,
  APP_BACKUP_PAGE_SIZE,
  APP_BACKUP_TABLES,
  APP_BACKUP_VERSION,
  APP_RESTORE_CHUNK_SIZE,
  isAppBackupBucket,
  isAppBackupTable,
  isSafeStoragePath,
} from '@/lib/workflow/database-backup';

interface BackupManifest {
  format: string;
  version: number;
  createdAt: string;
  projectHost: string;
  tables: string[];
  files: {
    bucket: string;
    path: string;
    archivePath: string;
    contentType: string;
    size: number;
  }[];
}

interface StorageListResponse {
  items: { name: string; isFolder: boolean; size: number; contentType: string }[];
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

async function getAccessToken(supabase: ReturnType<typeof createClient>) {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (!session?.access_token) throw new Error('Your administrator session has expired. Sign in again.');
  return session.access_token;
}

async function readJsonResponse<T>(response: Response): Promise<T> {
  let result: unknown;
  try {
    result = await response.json();
  } catch {
    throw new Error(`The server returned an invalid response (${response.status}).`);
  }
  if (!response.ok) {
    const message = typeof result === 'object'
      && result !== null
      && 'error' in result
      && typeof result.error === 'string'
      ? result.error
      : `The request failed (${response.status}).`;
    throw new Error(message);
  }
  return result as T;
}

async function apiGet<T>(path: string, token: string): Promise<T> {
  const response = await fetch(path, {
    cache: 'no-store',
    headers: { Authorization: `Bearer ${token}` },
  });
  return readJsonResponse<T>(response);
}

async function apiPost<T = { error?: string }>(token: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch('/api/admin/database-backup', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  return readJsonResponse<T>(response);
}

function getStorageArchivePath(bucket: string, path: string) {
  const encodedPath = path.split('/').map((part) => encodeURIComponent(part)).join('/');
  return `storage/${bucket}/${encodedPath}`;
}

function isBackupManifest(value: unknown): value is BackupManifest {
  if (typeof value !== 'object' || value === null) return false;
  const manifest = value as Partial<BackupManifest>;
  return manifest.format === APP_BACKUP_FORMAT
    && manifest.version === APP_BACKUP_VERSION
    && typeof manifest.createdAt === 'string'
    && typeof manifest.projectHost === 'string'
    && Array.isArray(manifest.tables)
    && manifest.tables.every((table) => typeof table === 'string')
    && Array.isArray(manifest.files)
    && manifest.files.every((file) => (
      typeof file === 'object'
      && file !== null
      && typeof file.bucket === 'string'
      && typeof file.path === 'string'
      && typeof file.archivePath === 'string'
      && typeof file.contentType === 'string'
      && file.contentType.length <= 255
      && Number.isSafeInteger(file.size)
      && file.size >= 0
    ));
}

export default function DatabaseBackupPage() {
  const supabase = useMemo(() => createClient(), []);
  const [backupBusy, setBackupBusy] = useState(false);
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const createBackup = async () => {
    setBackupBusy(true);
    setError('');
    setNotice('');
    setProgress('Preparing backup…');
    try {
      const token = await getAccessToken(supabase);
      const manifestData = await apiGet<{
        tables: string[];
        buckets: string[];
        projectHost: string;
      }>('/api/admin/database-backup?resource=manifest', token);
      const archiveEntries: Record<string, Uint8Array> = {};
      const manifest: BackupManifest = {
        format: APP_BACKUP_FORMAT,
        version: APP_BACKUP_VERSION,
        createdAt: new Date().toISOString(),
        projectHost: manifestData.projectHost,
        tables: [...manifestData.tables],
        files: [],
      };
      let totalBytes = 0;

      for (const table of manifest.tables) {
        if (!isAppBackupTable(table)) throw new Error(`Unsupported database table in backup manifest: ${table}`);
        setProgress(`Backing up ${table}…`);
        const records: unknown[] = [];
        for (let offset = 0; ; offset += APP_BACKUP_PAGE_SIZE) {
          const query = new URLSearchParams({
            resource: 'table',
            name: table,
            offset: String(offset),
          });
          const result = await apiGet<{ records: unknown[]; hasMore: boolean }>(
            `/api/admin/database-backup?${query.toString()}`,
            token,
          );
          records.push(...result.records);
          if (!result.hasMore) break;
        }
        const content = strToU8(JSON.stringify(records));
        totalBytes += content.byteLength;
        if (totalBytes > APP_BACKUP_MAX_BYTES) {
          throw new Error('This backup exceeds the 250 MB limit. Use Supabase’s managed backup options for larger projects.');
        }
        archiveEntries[`database/${table}.json`] = content;
      }

      let fileCount = 0;
      for (const bucketValue of manifestData.buckets) {
        if (!isAppBackupBucket(bucketValue)) throw new Error(`Unsupported storage bucket in backup manifest: ${bucketValue}`);
        const pendingFolders = [''];
        while (pendingFolders.length > 0) {
          const prefix = pendingFolders.shift() ?? '';
          for (let offset = 0; ; offset += 1000) {
            const query = new URLSearchParams({
              resource: 'storage-list',
              bucket: bucketValue,
              prefix,
              offset: String(offset),
            });
            const result = await apiGet<StorageListResponse>(
              `/api/admin/database-backup?${query.toString()}`,
              token,
            );
            for (const item of result.items) {
              const path = prefix ? `${prefix}/${item.name}` : item.name;
              if (item.isFolder) {
                if (!isSafeStoragePath(path)) throw new Error(`Unsafe storage folder path: ${path}`);
                pendingFolders.push(path);
                continue;
              }
              if (!isSafeStoragePath(path)) throw new Error(`Unsafe storage file path: ${path}`);

              setProgress(`Backing up files… ${fileCount + 1} found`);
              const signedQuery = new URLSearchParams({
                resource: 'storage-download-url',
                bucket: bucketValue,
                path,
              });
              const signed = await apiGet<{ signedUrl: string }>(
                `/api/admin/database-backup?${signedQuery.toString()}`,
                token,
              );
              const fileResponse = await fetch(signed.signedUrl);
              if (!fileResponse.ok) throw new Error(`Could not download stored file ${path}.`);
              const bytes = new Uint8Array(await fileResponse.arrayBuffer());
              totalBytes += bytes.byteLength;
              if (totalBytes > APP_BACKUP_MAX_BYTES) {
                throw new Error('This backup exceeds the 250 MB limit. Use Supabase’s managed backup options for larger projects.');
              }
              const archivePath = getStorageArchivePath(bucketValue, path);
              archiveEntries[archivePath] = bytes;
              manifest.files.push({
                bucket: bucketValue,
                path,
                archivePath,
                contentType: item.contentType || 'application/octet-stream',
                size: bytes.byteLength,
              });
              fileCount += 1;
            }
            if (result.items.length < 1000) break;
          }
        }
      }

      archiveEntries['manifest.json'] = strToU8(JSON.stringify(manifest, null, 2));
      setProgress('Creating downloadable archive…');
      const archive = zipSync(archiveEntries, { level: 0 });
      if (archive.byteLength > APP_BACKUP_MAX_BYTES) {
        throw new Error('The compressed backup exceeds the 250 MB download limit.');
      }
      const downloadUrl = URL.createObjectURL(new Blob([archive], { type: 'application/zip' }));
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `connect-daet-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.zip`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 60_000);
      setNotice(`Backup downloaded with ${manifest.tables.length} database tables and ${fileCount} stored files.`);
    } catch (backupError) {
      const message = getErrorMessage(backupError, 'Could not create the database backup.');
      logClientError('Database backup download failed:', message);
      setError(message);
    } finally {
      setProgress('');
      setBackupBusy(false);
    }
  };

  const restoreBackup = async (file: File) => {
    setRestoreBusy(true);
    setError('');
    setNotice('');
    setProgress('Reading backup archive…');
    let restoreId: string | null = null;
    let staged = false;
    try {
      if (file.size > APP_BACKUP_MAX_BYTES) {
        throw new Error('The backup file exceeds the 250 MB restore limit.');
      }
      const compressedBytes = new Uint8Array(await file.arrayBuffer());
      const entries = unzipSync(compressedBytes);
      const uncompressedSize = Object.values(entries).reduce((total, entry) => total + entry.byteLength, 0);
      if (uncompressedSize > APP_BACKUP_MAX_BYTES) {
        throw new Error('The uncompressed backup exceeds the 250 MB restore limit.');
      }

      const manifestBytes = entries['manifest.json'];
      if (!manifestBytes) throw new Error('The backup is missing its manifest.');
      let manifestValue: unknown;
      try {
        manifestValue = JSON.parse(strFromU8(manifestBytes));
      } catch {
        throw new Error('The backup manifest is not valid JSON.');
      }
      if (!isBackupManifest(manifestValue)) throw new Error('This file is not a supported CONNECT-Daet backup.');

      const projectResponse = await apiGet<{ projectHost: string }>(
        '/api/admin/database-backup?resource=manifest',
        await getAccessToken(supabase),
      );
      if (manifestValue.projectHost !== projectResponse.projectHost) {
        throw new Error('This backup belongs to a different Supabase project and cannot be merged here.');
      }
      if (
        manifestValue.tables.length !== APP_BACKUP_TABLES.length
        || manifestValue.tables.some((table, index) => table !== APP_BACKUP_TABLES[index])
      ) {
        throw new Error('The backup table list does not match this app version.');
      }
      if (manifestValue.files.length > 10_000) {
        throw new Error('This backup contains too many stored files to restore safely.');
      }

      const tableRecords = new Map<string, Record<string, unknown>[]>();
      let recordCount = 0;
      for (const table of manifestValue.tables) {
        if (!isAppBackupTable(table)) throw new Error(`Unsupported table in backup: ${table}`);
        const tableBytes = entries[`database/${table}.json`];
        if (!tableBytes) throw new Error(`The backup is missing database/${table}.json.`);
        let rows: unknown;
        try {
          rows = JSON.parse(strFromU8(tableBytes));
        } catch {
          throw new Error(`The backup table ${table} is not valid JSON.`);
        }
        if (!Array.isArray(rows) || !rows.every((row) => typeof row === 'object' && row !== null && !Array.isArray(row))) {
          throw new Error(`The backup table ${table} has an invalid record shape.`);
        }
        tableRecords.set(table, rows as Record<string, unknown>[]);
        recordCount += rows.length;
      }

      for (const storedFile of manifestValue.files) {
        const expectedArchivePath = isAppBackupBucket(storedFile.bucket)
          ? getStorageArchivePath(storedFile.bucket, storedFile.path)
          : '';
        if (
          !isAppBackupBucket(storedFile.bucket)
          || !isSafeStoragePath(storedFile.path)
          || storedFile.archivePath !== expectedArchivePath
          || !entries[storedFile.archivePath]
          || entries[storedFile.archivePath].byteLength !== storedFile.size
        ) {
          throw new Error('The backup contains an invalid or missing stored file.');
        }
      }

      if (!window.confirm(
        `Merge ${recordCount.toLocaleString()} application records and ${manifestValue.files.length.toLocaleString()} files from this backup? Existing database rows and files will not be overwritten or deleted. Auth users and profile roles are not restored.`
      )) {
        setRestoreBusy(false);
        setProgress('');
        return;
      }

      const token = await getAccessToken(supabase);
      restoreId = window.crypto.randomUUID();
      staged = true;
      let stagedCount = 0;

      for (const table of APP_BACKUP_TABLES) {
        const rows = tableRecords.get(table) ?? [];
        const chunks = rows.length > 0
          ? Array.from({ length: Math.ceil(rows.length / APP_RESTORE_CHUNK_SIZE) }, (_, index) => (
            rows.slice(index * APP_RESTORE_CHUNK_SIZE, (index + 1) * APP_RESTORE_CHUNK_SIZE)
          ))
          : [[]];
        for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
          setProgress(`Preparing database restore… ${table} (${stagedCount.toLocaleString()} records)`);
          await apiPost(token, {
            action: 'stage-table',
            restoreId,
            table,
            chunkIndex,
            records: chunks[chunkIndex],
          });
          stagedCount += chunks[chunkIndex].length;
        }
      }

      let uploadedFileCount = 0;
      let existingFileCount = 0;
      for (let index = 0; index < manifestValue.files.length; index += 1) {
        const storedFile = manifestValue.files[index];
        setProgress(`Restoring stored files… ${index + 1} of ${manifestValue.files.length}`);
        const upload = await apiPost<{
          exists: boolean;
          token?: string;
          path?: string;
          contentType?: string;
        }>(token, {
          action: 'storage-upload-url',
          restoreId,
          bucket: storedFile.bucket,
          path: storedFile.path,
          contentType: storedFile.contentType,
        });
        if (upload.exists) {
          existingFileCount += 1;
          continue;
        }
        const bytes = entries[storedFile.archivePath];
        const { error: uploadError } = await supabase.storage
          .from(storedFile.bucket)
          .uploadToSignedUrl(
            upload.path ?? storedFile.path,
            upload.token ?? '',
            new Blob([bytes], { type: storedFile.contentType }),
            { contentType: storedFile.contentType },
          );
        if (uploadError) {
          throw new Error(`Could not restore file ${storedFile.path}: ${uploadError.message}`);
        }
        uploadedFileCount += 1;
      }

      setProgress('Validating and merging database records…');
      const result = await apiPost<{
        result?: { inserted_rows?: number; profile_rows_not_imported?: number };
      }>(token, { action: 'finalize', restoreId });
      staged = false;
      setNotice(
        `Restore complete: ${result.result?.inserted_rows ?? 0} new database rows merged, ${uploadedFileCount} files added, ${existingFileCount} existing files kept. Profile rows were exported but not restored; existing Auth accounts and profiles are preserved.`
      );
    } catch (restoreError) {
      const message = getErrorMessage(restoreError, 'Could not restore this backup.');
      logClientError('Database backup restore failed:', message);
      setError(`${message}${restoreId ? ' The database merge is atomic; files already uploaded may remain in Storage and will be reused if you retry.' : ''}`);
      if (staged && restoreId) {
        try {
          const token = await getAccessToken(supabase);
          await apiPost(token, { action: 'cleanup', restoreId });
        } catch (cleanupError) {
          logClientError('Could not clean up staged backup data:', getErrorMessage(cleanupError, 'Unknown cleanup error.'));
        }
      }
    } finally {
      setProgress('');
      setRestoreBusy(false);
    }
  };

  const handleRestoreFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (file) void restoreBackup(file);
  };

  return (
    <div className="space-y-7">
      <PageHero
        greet={false}
        className="mb-0"
        eyebrow="Administration"
        icon="database"
        title="Database Backup & Restore"
        description={
          <p className="max-w-3xl leading-5">
            Download a project-bound archive of application database records and workflow files. Restore merges missing records and files without overwriting existing ones.
          </p>
        }
      />

      {error && (
        <div role="alert" className="ui-fade-up flex items-start gap-2 rounded-xl border border-rejected-bg bg-rejected-bg/50 px-4 py-3 text-xs text-rejected-text">
          <Icon name="alert" size={15} className="mt-px shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {notice && (
        <div role="status" className="ui-fade-up flex items-start gap-2 rounded-xl border border-approved-bg bg-approved-bg/50 px-4 py-3 text-xs text-approved-text">
          <Icon name="check" size={15} className="mt-px shrink-0" />
          <span>{notice}</span>
        </div>
      )}
      {progress && (
        <div role="status" className="ui-fade-up flex items-center gap-3 rounded-xl border border-warm-border bg-card px-4 py-3 text-xs text-muted-text">
          <Icon name="refresh" size={15} className="shrink-0 animate-spin text-clay motion-reduce:animate-none" />
          {progress}
        </div>
      )}

      <div className="ui-stagger grid gap-5 lg:grid-cols-2">
        <section className="ui-lift group rounded-2xl border border-warm-border bg-card p-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-clay-soft text-clay transition-transform duration-300 group-hover:-translate-y-0.5"><Icon name="download" size={19} /></div>
          <h2 className="mt-4 text-base font-semibold text-warm-text">Download a backup</h2>
          <p className="mt-2 min-h-12 text-xs leading-5 text-muted-text">
            Includes application tables, audit history, and files from the workflow storage buckets. The archive is limited to 250 MB.
          </p>
          <button
            type="button"
            disabled={backupBusy || restoreBusy}
            onClick={() => void createBackup()}
            className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-clay px-5 text-xs font-semibold text-white transition-colors hover:bg-clay/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Icon name={backupBusy ? 'refresh' : 'download'} size={15} className={backupBusy ? 'animate-spin motion-reduce:animate-none' : ''} />
            {backupBusy ? 'Creating backup…' : 'Download backup archive'}
          </button>
        </section>

        <section className="ui-lift group rounded-2xl border border-warm-border bg-card p-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-clay-soft text-clay transition-transform duration-300 group-hover:-translate-y-0.5"><Icon name="database" size={19} /></div>
          <h2 className="mt-4 text-base font-semibold text-warm-text">Merge a backup</h2>
          <p className="mt-2 min-h-12 text-xs leading-5 text-muted-text">
            Restores missing records and files only. Existing records, uploaded files, Auth accounts, and profile roles are not overwritten or deleted.
          </p>
          <label className={`mt-5 inline-flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-full border border-warm-border px-5 text-xs font-semibold text-warm-text transition-colors hover:bg-sidebar ${restoreBusy || backupBusy ? 'pointer-events-none opacity-60' : ''}`}>
            <Icon name={restoreBusy ? 'refresh' : 'archive'} size={15} className={restoreBusy ? 'animate-spin motion-reduce:animate-none' : ''} />
            {restoreBusy ? 'Restoring backup…' : 'Choose backup archive'}
            <input
              type="file"
              accept=".zip,application/zip"
              disabled={restoreBusy || backupBusy}
              onChange={handleRestoreFile}
              className="sr-only"
            />
          </label>
        </section>
      </div>

      <section className="ui-fade-up rounded-2xl border border-pending-bg bg-pending-bg/40 p-5">
        <h2 className="flex items-center gap-2 text-xs font-semibold text-pending-text"><Icon name="shield-check" size={15} /> Backup scope and restore notes</h2>
        <ul className="mt-2 list-disc space-y-1 pl-4 text-[11px] leading-5 text-muted-text">
          <li>Archives are tied to this Supabase project and cannot be merged into another project.</li>
          <li>Supabase Auth users, passwords, internal schemas, and live officer-presence sessions are not included.</li>
          <li>Profile records are included in the archive for reference, but are not restored, so user roles and account access cannot be changed by an uploaded file.</li>
          <li>Restore validates database foreign keys and rolls back all database changes if validation fails. Files uploaded before a failed database merge may remain in Storage; retrying the archive will reuse them.</li>
          <li>Keep the downloaded archive in a secure location. It may contain personal and confidential workflow data.</li>
        </ul>
      </section>
    </div>
  );
}
