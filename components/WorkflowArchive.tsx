'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import {
  getOfficeFileManagementPath,
  getWorkflowDocumentTypeLabel,
  isOfficeRole,
  OFFICE_CONFIG,
  type OfficeRole,
} from '@/lib/workflow/offices';
import { getSubmissionStatusLabel, getSubmissionStatusTone } from '@/lib/workflow/status';
import { useWorkflowPolling } from '@/lib/workflow/useWorkflowPolling';

type ArchiveRole = 'submitter' | 'system_admin' | OfficeRole;

interface ArchiveRecord {
  id: string;
  tracking_number: string | null;
  file_name: string;
  file_type: string | null;
  file_size: number | null;
  status: string;
  category: string | null;
  other_document_type: string | null;
  created_at: string;
  archive_date: string;
  requester_email: string | null;
  selected_office_role: string | null;
  initial_destination_role: string | null;
}

function getStatusClasses(status: string) {
  const tone = getSubmissionStatusTone(status);
  if (tone === 'completed') return 'bg-approved-bg text-approved-text';
  if (tone === 'progress') return 'bg-review-bg text-review-text';
  return 'bg-sidebar text-muted-text';
}

export default function WorkflowArchive({
  role,
  adminOfficeView = false,
}: {
  role: ArchiveRole;
  adminOfficeView?: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [records, setRecords] = useState<ArchiveRecord[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refreshArchive = useCallback(async (background = false) => {
    if (!background) setLoading(true);
    setError('');
    const officeRole = isOfficeRole(role) ? role : null;
    const { data, error: archiveError } = await supabase.rpc('get_workflow_archive', {
      archive_office_role: officeRole,
    });

    if (archiveError) {
      console.error('Workflow archive load failed:', archiveError.message);
      if (!background) setRecords([]);
      setError('Could not load this archive. Please try again.');
    } else {
      setRecords((data ?? []) as ArchiveRecord[]);
    }
    if (!background) setLoading(false);
  }, [role, supabase]);

  useEffect(() => {
    void refreshArchive();
  }, [refreshArchive]);
  useWorkflowPolling(() => refreshArchive(true));

  const filteredRecords = useMemo(() => {
    const query = search.trim().toLowerCase();
    return records.filter((record) =>
      !query
      || record.file_name.toLowerCase().includes(query)
      || (record.tracking_number ?? '').toLowerCase().includes(query)
      || (role === 'system_admin' && (record.requester_email ?? '').toLowerCase().includes(query))
    );
  }, [records, role, search]);

  const isOfficeArchive = isOfficeRole(role);
  const workspaceLabel = role === 'system_admin'
    ? 'Admin workspace'
    : isOfficeArchive
      ? 'Office workspace'
      : 'User portal';
  const description = role === 'system_admin'
    ? 'All approved and completed submissions across the system.'
    : isOfficeArchive
      ? `Approved and completed submissions handled by ${OFFICE_CONFIG[role].label}.`
      : 'Your approved and completed submissions.';
  const registryHref = role === 'system_admin'
    ? '/workflow/admin/submissions'
    : isOfficeArchive
      ? `${getOfficeFileManagementPath(role)}${adminOfficeView ? `?office=${role}` : ''}`
      : '/workflow/user/file_registry';
  const detailHref = (submissionId: string) => {
    if (role === 'system_admin') return `/workflow/admin/submissions/${submissionId}`;
    if (isOfficeArchive) {
      return `${getOfficeFileManagementPath(role)}/${submissionId}${adminOfficeView ? `?office=${role}` : ''}`;
    }
    return `/workflow/user/file_registry/${submissionId}`;
  };

  return (
    <div className="w-full">
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between max-md:mb-5">
        <div>
          <p className="mb-3 flex items-center gap-2 text-[11px] font-medium text-muted-text max-md:mb-2">
            <span className="h-1.5 w-1.5 rounded-full bg-clay" /> {workspaceLabel}
          </p>
          <h1 className="font-serif text-[32px] leading-tight text-warm-text max-md:text-[26px]">Archive</h1>
          <p className="mt-2 text-xs text-muted-text">{description}</p>
        </div>
        <Link
          href={registryHref}
          className="inline-flex h-11 items-center justify-center rounded-full border border-warm-border bg-card px-5 text-xs font-semibold text-warm-text transition-colors hover:bg-sidebar"
        >
          Back to File Registry
        </Link>
      </header>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          aria-label={role === 'system_admin'
            ? 'Search archive by file name, tracking number or requester'
            : 'Search archive by file name or tracking number'}
          placeholder={role === 'system_admin'
            ? 'Search by file name, tracking number or requester...'
            : 'Search by file name or tracking number...'}
          className="h-12 w-full rounded-full border border-warm-border bg-card px-5 text-sm text-warm-text outline-none transition-colors placeholder:text-muted-text/60 focus:border-clay"
        />
        <button
          type="button"
          onClick={() => void refreshArchive()}
          disabled={loading}
          className="h-12 shrink-0 rounded-full border border-warm-border bg-card px-5 text-xs font-semibold text-warm-text transition-colors hover:bg-sidebar disabled:opacity-50"
        >
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {error && (
        <div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rejected-bg bg-rejected-bg/50 px-4 py-3 text-xs text-rejected-text">
          <span>{error}</span>
          <button type="button" onClick={() => void refreshArchive()} className="font-semibold underline">Retry</button>
        </div>
      )}

      <div className="mb-4 flex items-center gap-3">
        <h2 className="text-sm font-semibold text-warm-text">Approved and completed files</h2>
        <span className="rounded-md bg-sidebar px-2 py-1 text-[10px] font-medium text-muted-text">{filteredRecords.length}</span>
      </div>

      {loading ? (
        <div className="flex items-center gap-3 rounded-2xl border border-warm-border bg-card px-5 py-8 text-xs text-muted-text">
          <span className="h-2 w-2 animate-pulse rounded-full bg-clay" /> Loading archive...
        </div>
      ) : filteredRecords.length === 0 ? (
        <div className="rounded-2xl border border-warm-border bg-card py-16 text-center">
          <p className="font-serif text-2xl text-warm-text">Nothing here</p>
          <p className="mt-2 text-xs text-muted-text">
            {search ? 'No files match your search.' : 'Approved and completed files will appear here.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredRecords.map((record) => (
            <article
              key={record.id}
              className="grid grid-cols-1 gap-4 rounded-2xl border border-warm-border bg-card px-5 py-5 sm:grid-cols-12 max-md:gap-3 max-md:px-3.5 max-md:py-3.5"
            >
              <div className="flex min-w-0 items-center gap-4 sm:col-span-8">
                <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-sidebar text-muted-text">
                  <span className="text-lg leading-4" aria-hidden="true">▤</span>
                  <span className="mt-1 text-[8px] font-semibold uppercase">
                    {record.file_type?.split('/').at(-1)?.slice(0, 3) || 'Doc'}
                  </span>
                </div>
                <div className="min-w-0">
                  <span className="inline-flex rounded-md bg-clay-soft px-2 py-1 text-[10px] font-medium text-clay">
                    {getWorkflowDocumentTypeLabel(record.category, record.other_document_type)}
                  </span>
                  <h3 className="mt-1 truncate text-sm font-semibold text-warm-text">{record.file_name}</h3>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-text">
                    <span>{record.tracking_number || 'Tracking pending'}</span>
                    <span aria-hidden="true">·</span>
                    <span>ID: {record.id.slice(0, 8)}</span>
                    {role === 'system_admin' && record.requester_email && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>From {record.requester_email}</span>
                      </>
                    )}
                  </div>
                  <p className="mt-1 text-[11px] text-muted-text">
                    {record.status === 'approved' ? 'Approved' : 'Completed'}{' '}
                    {new Date(record.archive_date).toLocaleDateString()}
                    {' · '}Uploaded {new Date(record.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 sm:col-span-4 sm:justify-end">
                <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-medium ${getStatusClasses(record.status)}`}>
                  <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
                  {getSubmissionStatusLabel(record.status)}
                </span>
                <Link
                  href={detailHref(record.id)}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-clay px-5 text-xs font-semibold text-white transition-colors hover:bg-warm-text max-md:w-full"
                >
                  View document <span aria-hidden="true">→</span>
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
