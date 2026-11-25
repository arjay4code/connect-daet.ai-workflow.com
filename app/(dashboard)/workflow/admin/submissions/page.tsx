'use client';
import { logClientError } from '@/lib/clientLogger';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import AdminDeleteSubmissionButton from '@/components/AdminDeleteSubmissionButton';
import FileBrowserFilterSelect from '@/components/FileBrowserFilterSelect';
import FileBrowserPagination from '@/components/FileBrowserPagination';
import FilePreview, { downloadFile, getFileUrl } from '@/components/FilePreview';
import FileBrowserSortSelect from '@/components/FileBrowserSortSelect';
import { useSubmissions } from '@/hooks/useSubmissions';
import { createClient } from '@/lib/supabase/client';
import {
  getWorkflowDocumentTypeLabel,
  getWorkflowSubmissionDisplayTitle,
} from '@/lib/workflow/offices';
import {
  ADMIN_DOCUMENT_PAGE_SIZE,
  matchesFileBrowserFilter,
  paginateFileBrowserItems,
  sortFileBrowserSubmissions,
  type FileBrowserFilter,
  type FileBrowserSort,
} from '@/lib/workflow/file-browser';
import { getSubmissionStatusLabel, getSubmissionStatusTone } from '@/lib/workflow/status';
import type { Submission } from '@/hooks/useSubmissions';
import Icon from '@/components/ui/Icon';
import PageHero from '@/components/ui/PageHero';
import SkeletonRows from '@/components/ui/SkeletonRows';

// ─── Styles ──────────────────────────────────────────────────────────────────
const fonts = {
  serif: 'font-serif',
};

// ─── Status Stamp ────────────────────────────────────────────────────────────
function StatusStamp({ status }: { status: string }) {
  const tone = getSubmissionStatusTone(status);
  const declined = status.toLowerCase().includes('declined') || status.toLowerCase() === 'rejected';
  const styles = declined
    ? 'bg-rejected-bg text-rejected-text'
    : tone === 'completed'
      ? 'bg-approved-bg text-approved-text'
      : tone === 'progress'
        ? 'bg-review-bg text-review-text'
        : tone === 'pending' || tone === 'returned'
          ? 'bg-pending-bg text-pending-text'
          : 'bg-sidebar text-muted-text';

  return (
    <div className={`inline-flex items-center gap-2 whitespace-nowrap rounded-full px-3 py-1.5 text-[11px] font-medium ${styles}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {declined ? 'Rejected' : getSubmissionStatusLabel(status)}
    </div>
  );
}

export default function SubmissionsPage() {
  const [filter, setFilter] = useState<FileBrowserFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sort, setSort] = useState<FileBrowserSort>('newest');
  const [page, setPage] = useState(1);
  const [previewFile, setPreviewFile] = useState<Submission | null>(null);
  const [previewError, setPreviewError] = useState('');
  const { submissions, loading, refreshSubmissions } = useSubmissions();
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    if (!previewFile) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPreviewFile(null);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [previewFile]);

  const filteredSubmissions = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return submissions.filter((sub) => {
      const matchesSearch = !query
        || sub.file_name.toLowerCase().includes(query)
        || sub.tracking_number?.toLowerCase().includes(query)
        || sub.profiles?.email?.toLowerCase().includes(query);
      return matchesSearch && matchesFileBrowserFilter(sub.status, filter);
    });
  }, [filter, searchQuery, submissions]);
  const sortedSubmissions = useMemo(
    () => sortFileBrowserSubmissions(filteredSubmissions, sort),
    [filteredSubmissions, sort]
  );
  const paginatedSubmissions = useMemo(
    () => paginateFileBrowserItems(sortedSubmissions, page, ADMIN_DOCUMENT_PAGE_SIZE),
    [page, sortedSubmissions]
  );

  const downloadPreview = async () => {
    if (!previewFile) return;
    setPreviewError('');
    try {
      await downloadFile(await getFileUrl(supabase, previewFile), previewFile.file_name);
    } catch (error) {
      logClientError('Admin document download failed:', error);
      setPreviewError(error instanceof Error ? error.message : 'Could not download this document.');
    }
  };

  return (
    <div className="w-full">
      {/* Header */}
      <PageHero
        greet={false}
        eyebrow="Admin workspace"
        icon="files"
        title="Files."
        description={<>Search and review submissions from across the system. Showing <span className="text-warm-text">{filteredSubmissions.length}</span> files.</>}
        actions={
          <Link
            href="/workflow/admin/archive"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-warm-border bg-card px-5 text-xs font-semibold text-warm-text transition-colors hover:bg-sidebar"
          >
            <Icon name="archive" size={15} /> Archive
          </Link>
        }
      />

      {/* Filters */}
      <div className="mb-4 space-y-3">
        <div className="relative">
        <Icon name="search" size={16} className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-muted-text" />
        <input
          type="search"
          value={searchQuery}
          onChange={(event) => {
            setSearchQuery(event.target.value);
            setPage(1);
          }}
          aria-label="Search files by name, tracking number, or requester email"
          placeholder="Find a file by name, tracking number, or requester..."
          className="h-12 w-full rounded-full border border-warm-border bg-card pl-12 pr-5 text-sm text-warm-text outline-none transition-colors placeholder:text-muted-text/60 focus:border-clay max-md:h-11"
        />
        </div>

        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
          <FileBrowserFilterSelect
            value={filter}
            onChange={(value) => {
              setFilter(value);
              setPage(1);
            }}
          />
          <FileBrowserSortSelect
            value={sort}
            onChange={(value) => {
              setSort(value);
              setPage(1);
            }}
          />
          <button
            type="button"
            onClick={() => void refreshSubmissions()}
            disabled={loading}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-warm-border bg-card px-5 text-xs font-medium text-warm-text transition-colors hover:bg-sidebar disabled:opacity-50 max-md:h-11"
          >
            <Icon name="refresh" size={14} className={loading ? 'animate-spin motion-reduce:animate-none' : ''} />
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* List header */}
      <div className="mb-4 flex items-center gap-3">
        <h2 className="text-sm font-semibold text-warm-text">All files</h2>
        <span className="rounded-md bg-sidebar px-2 py-1 text-[10px] font-medium text-muted-text">{filteredSubmissions.length}</span>
      </div>

      {/* List */}
      {loading && submissions.length === 0 ? (
        <SkeletonRows rows={4} label="Loading files…" />
      ) : filteredSubmissions.length === 0 ? (
        <div className="ui-fade-up rounded-2xl border border-warm-border bg-card py-16 text-center">
          <span className="ui-float mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-clay-soft text-clay">
            <Icon name="search" size={24} />
          </span>
          <p className={`${fonts.serif} text-2xl text-warm-text`}>Nothing here</p>
          <p className="mt-2 text-xs text-muted-text">No files match your search or filters.</p>
        </div>
      ) : (
        <div className="ui-stagger space-y-3">
          {paginatedSubmissions.items.map((sub) => {
            return (
              <article
                key={sub.id}
                className="ui-lift group grid grid-cols-1 gap-4 rounded-2xl border border-warm-border bg-card px-5 py-5 hover:border-clay-border sm:grid-cols-12 max-md:gap-3 max-md:px-3.5 max-md:py-3.5"
              >
                <div className="flex min-w-0 items-center gap-4 sm:col-span-8">
                  <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-sidebar text-muted-text transition-colors duration-200 group-hover:bg-clay-soft group-hover:text-clay">
                    <Icon name="file" size={18} />
                    <span className="mt-1 text-[8px] font-semibold uppercase">{sub.file_type?.split('/').at(-1)?.slice(0, 3) || 'File'}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="mb-1.5 flex flex-wrap items-center gap-2">
                      <span className="rounded-md bg-clay-soft px-2 py-1 text-[10px] font-medium text-clay">
                        {getWorkflowDocumentTypeLabel(sub.category ?? null, sub.other_document_type)}
                      </span>
                      <span className="text-[11px] text-muted-text">ID: {sub.id.slice(0, 8)}</span>
                    </div>
                    <h3 className="truncate text-sm font-semibold text-warm-text group-hover:text-clay">{getWorkflowSubmissionDisplayTitle(sub)}</h3>
                    <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1">
                      <div className="flex flex-col">
                        <span className="text-[10px] font-medium text-muted-text">Date uploaded</span>
                        <span className="text-[11px] text-warm-text">{new Date(sub.created_at).toLocaleDateString()}</span>
                      </div>
                      {sub.file_size ? (
                        <div className="flex flex-col border-l border-warm-border pl-5">
                          <span className="text-[10px] font-medium text-muted-text">Size</span>
                          <span className="text-[11px] text-warm-text">{(sub.file_size / 1024).toFixed(1)} KB</span>
                        </div>
                      ) : null}
                      <div className="flex flex-col border-l border-warm-border pl-5">
                        <span className="text-[10px] font-medium text-muted-text">Requester</span>
                        <span className="max-w-56 truncate text-[11px] text-warm-text">{sub.profiles?.email ?? 'Not available'}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 sm:col-span-4 sm:justify-end max-md:w-full max-md:flex-col max-md:items-stretch">
                  <div className="flex flex-col items-start gap-1.5 sm:items-end max-md:self-start">
                    <span className="text-[10px] font-medium text-muted-text">Current status</span>
                    <StatusStamp status={sub.status} />
                  </div>
                  <div className="flex items-center gap-2 max-md:w-full max-md:flex-col max-md:items-stretch">
                    <button
                      type="button"
                      onClick={() => {
                        setPreviewError('');
                        setPreviewFile(sub);
                      }}
                      className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-warm-border text-warm-text transition-colors hover:bg-sidebar max-md:h-11 max-md:w-full"
                      title="Quick preview"
                      aria-label={`Preview ${sub.file_name}`}
                    >
                      <Icon name="eye" size={18} />
                    </button>
                    <Link
                      href={`/workflow/admin/submissions/${sub.id}`}
                      className="group/view inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-full bg-clay px-5 text-xs font-semibold text-white transition-colors hover:bg-warm-text max-md:h-11 max-md:w-full"
                    >
                      View document <Icon name="arrow-right" size={14} className="transition-transform duration-200 group-hover/view:translate-x-0.5" />
                    </Link>
                    <AdminDeleteSubmissionButton
                      submissionId={sub.id}
                      fileName={sub.file_name}
                      onDeleted={() => void refreshSubmissions()}
                    />
                  </div>
                </div>
              </article>
            );
          })}
          <FileBrowserPagination
            start={paginatedSubmissions.start}
            end={paginatedSubmissions.end}
            totalItems={filteredSubmissions.length}
            page={paginatedSubmissions.page}
            totalPages={paginatedSubmissions.totalPages}
            onPageChange={setPage}
          />
        </div>
      )}

      {previewFile && (
        <div className="fixed inset-0 z-100 flex flex-col bg-warm-text/75 backdrop-blur-sm animate-in fade-in duration-300 max-md:bg-card max-md:backdrop-blur-none">
          <section
            role="dialog"
            aria-modal="true"
            aria-label={`Preview ${previewFile.file_name}`}
            className="flex h-full flex-col"
          >
            <header className="flex min-h-16 items-center justify-between gap-4 border-b border-warm-border bg-card px-4 py-3 sm:px-8">
              <div className="flex min-w-0 flex-col">
                <span className="mb-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-text">Document preview</span>
                <h2 className="max-w-[55vw] truncate text-sm font-semibold text-warm-text">{previewFile.file_name}</h2>
              </div>
              <div className="flex shrink-0 items-center gap-2 sm:gap-3">
                <button
                  type="button"
                  onClick={() => void downloadPreview()}
                  className="inline-flex h-10 items-center rounded-full border border-warm-border px-4 text-[11px] font-medium text-warm-text transition-colors hover:bg-sidebar max-md:h-11"
                >
                  Download
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewFile(null)}
                  className="inline-flex h-10 items-center rounded-full bg-clay px-4 text-[11px] font-semibold text-white transition-colors hover:bg-warm-text max-md:h-11"
                >
                  Close
                </button>
              </div>
            </header>
            {previewError && (
              <p role="alert" className="border-b border-rejected-bg bg-rejected-bg/50 px-4 py-2 text-xs text-rejected-text">
                {previewError}
              </p>
            )}
            <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-cream p-3 sm:p-8 max-md:bg-card max-md:p-0">
              <div className="relative flex h-full w-full max-w-6xl items-center justify-center overflow-hidden rounded-xl border border-warm-border bg-card shadow-xl max-md:max-w-none max-md:rounded-none max-md:border-0 max-md:shadow-none">
                <FilePreview file={previewFile} />
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}