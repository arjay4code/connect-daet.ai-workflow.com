'use client';
import { logClientError } from '@/lib/clientLogger';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import FileBrowserFilterSelect from '@/components/FileBrowserFilterSelect';
import FilePreview, { downloadFile, getFileUrl } from '@/components/FilePreview';
import WorkflowRoutingPipeline from '@/components/WorkflowRoutingPipeline';
import { getWorkflowDocumentTypeLabel } from '@/lib/workflow/offices';
import { getSubmissionStatusLabel } from '@/lib/workflow/status';
import { matchesFileBrowserFilter, type FileBrowserFilter } from '@/lib/workflow/file-browser';
import { useRoutePreviews } from '@/lib/workflow/useRoutePreviews';
import { useWorkflowAutoRefresh } from '@/lib/workflow/useWorkflowAutoRefresh';
import Icon from '@/components/ui/Icon';
import PageHero from '@/components/ui/PageHero';
import SkeletonRows from '@/components/ui/SkeletonRows';

// ─── Styles & Fonts (synced with dashboard) ──────────────────────────────────
const fonts = {
  serif: "font-serif",
  mono: "font-sans text-xs",
};

interface PreviewSubmission {
  file_name: string;
  file_url: string;
  file_path?: string | null;
  file_type?: string | null;
}

interface FileSubmission extends PreviewSubmission {
  id: string;
  tracking_number?: string | null;
  created_at: string;
  status: string;
  category?: string | null;
  other_document_type?: string | null;
  file_size?: number | null;
  selected_office_role?: string | null;
}

export default function UserFileRegistry() {
  const [submissions, setSubmissions] = useState<FileSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<FileBrowserFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [previewFile, setPreviewFile] = useState<PreviewSubmission | null>(null);
  const supabase = useMemo(() => createClient(), []);
  const routesBySubmission = useRoutePreviews(submissions);

  useEffect(() => {
    if (!previewFile) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPreviewFile(null);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [previewFile]);

  const fetchUserFiles = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('workflow_submissions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) logClientError('Fetch error:', error);
      setSubmissions(data || []);
    } catch (err) {
      logClientError('Failed to load files:', err);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    void fetchUserFiles();
  }, [fetchUserFiles]);

  useWorkflowAutoRefresh(supabase, fetchUserFiles);

  const filteredSubmissions = submissions.filter(file => {
    const query = searchQuery.trim().toLowerCase();
    const matchesSearch = !query
      || (file.file_name || '').toLowerCase().includes(query)
      || (file.tracking_number || '').toLowerCase().includes(query)
      || file.id.toLowerCase().includes(query);
    return matchesSearch && matchesFileBrowserFilter(file.status, activeFilter);
  });

  return (
    <div className="w-full">
      <div>

        {/* HEADER */}
        <PageHero
          greet={false}
          eyebrow="User Portal // My Submissions"
          icon="files"
          title="Files."
          description={<>Every request you have sent, with its live route. Showing <span className="text-warm-text">{filteredSubmissions.length}</span> files.</>}
          actions={
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
              <Link
                href="/workflow/user/archive"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-warm-border bg-card px-6 text-xs font-semibold text-warm-text transition-colors hover:bg-sidebar max-md:w-full"
              >
                <Icon name="archive" size={15} /> Archive
              </Link>
              <Link
                href="/workflow/user/upload"
                className="group inline-flex h-11 items-center justify-center gap-2 rounded-full bg-clay px-6 text-xs font-semibold text-white transition-all hover:-translate-y-0.5 hover:bg-warm-text max-md:w-full"
              >
                <Icon name="plus" size={16} className="transition-transform duration-300 group-hover:rotate-90" /> Upload New File
              </Link>
            </div>
          }
        />

        {/* TOOLBAR */}
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full lg:max-w-xl lg:flex-1">
            <span className="pointer-events-none absolute left-5 top-1/2 z-10 flex -translate-y-1/2 items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-text"><Icon name="search" size={15} /> SEARCH //</span>
            <input
              type="text"
              placeholder="Find a file by name, tracking number, or ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-12 w-full rounded-full border border-warm-border bg-card pl-32 pr-5 text-sm text-warm-text outline-none transition-colors placeholder:text-muted-text/60 focus:border-clay max-md:h-11"
            />
          </div>

          <FileBrowserFilterSelect value={activeFilter} onChange={setActiveFilter} />
        </div>

        {/* FILE LIST */}
        <div>
          {loading ? (
            <SkeletonRows rows={4} label="Loading your files…" />
          ) : filteredSubmissions.length === 0 ? (
            <div className="ui-fade-up rounded-2xl border border-warm-border bg-card py-16 text-center">
              <span className="ui-float mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-clay-soft text-clay">
                <Icon name="search" size={24} />
              </span>
              <p className={`${fonts.serif} text-2xl text-warm-text`}>Nothing here</p>
              <p className="mt-2 text-xs text-muted-text">
                No files match your search or selected status filter.
              </p>
            </div>
          ) : (
            <div className="ui-stagger space-y-3">
              {filteredSubmissions.map((file) => {
                const route = routesBySubmission[file.id];
                return (
                  <article
                    key={file.id}
                    className="ui-lift group grid grid-cols-1 gap-4 rounded-2xl border border-warm-border bg-card px-5 py-5 hover:border-clay-border sm:grid-cols-12 max-md:gap-3 max-md:px-3.5 max-md:py-3.5"
                  >
                    <div className="flex min-w-0 items-center gap-4 sm:col-span-8">
                      <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-sidebar text-muted-text transition-colors duration-200 group-hover:bg-clay-soft group-hover:text-clay">
                        <Icon name="file" size={18} />
                        <span className="mt-1 text-[8px] font-semibold uppercase">{file.file_type?.split('/').at(-1)?.slice(0, 3) || 'File'}</span>
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="mb-1.5 flex flex-wrap items-center gap-2">
                          <span className="rounded-md bg-clay-soft px-2 py-1 text-[10px] font-medium text-clay">
                            {getWorkflowDocumentTypeLabel(file.category ?? null, file.other_document_type)}
                          </span>
                          <span className="text-[11px] text-muted-text">
                            ID: {String(file.id).slice(0, 8)}
                          </span>
                        </div>

                        <h3 className="truncate text-sm font-semibold text-warm-text group-hover:text-clay">
                          {file.file_name}
                        </h3>

                        <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1">
                          <div className="flex flex-col">
                            <span className="text-[10px] font-medium text-muted-text">Date Uploaded</span>
                            <span className="text-[11px] text-warm-text">{new Date(file.created_at).toLocaleDateString()}</span>
                          </div>
                          {file.file_size ? (
                            <div className="flex flex-col border-l border-warm-border pl-5">
                              <span className="text-[10px] font-medium text-muted-text">Size</span>
                              <span className="text-[11px] text-warm-text">{(file.file_size / 1024).toFixed(1)} KB</span>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 sm:col-span-4 sm:justify-end max-md:w-full max-md:flex-col max-md:items-stretch">
                      <div className="flex flex-col items-start gap-1.5 sm:items-end max-md:self-start">
                        <span className="text-[10px] font-medium text-muted-text">Current Status</span>
                        <StatusBadge status={file.status} />
                      </div>

                      <div className="flex items-center gap-2 max-md:w-full max-md:flex-col max-md:items-stretch">
                        <button
                          onClick={() => setPreviewFile(file)}
                          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-warm-border text-warm-text transition-colors hover:bg-sidebar max-md:h-11 max-md:w-full"
                          title="Quick Preview"
                          aria-label="Quick Preview"
                        >
                          <Icon name="eye" size={18} />
                        </button>

                        <Link
                          href={`/workflow/user/file_registry/${file.id}`}
                          className="group/view inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-full bg-clay px-5 text-xs font-semibold text-white transition-colors hover:bg-warm-text max-md:h-11 max-md:w-full"
                        >
                          View document <Icon name="arrow-right" size={14} className="transition-transform duration-200 group-hover/view:translate-x-0.5" />
                        </Link>
                      </div>
                    </div>

                    <div className="sm:col-span-12">
                      <WorkflowRoutingPipeline
                        variant="compact"
                        submissionStatus={file.status}
                        submittedAt={file.created_at}
                        routeSteps={route?.steps ?? []}
                        routeStatus={route?.status ?? null}
                        routeFinalizedAt={route?.finalizedAt}
                        selectedOfficeRole={file.selected_office_role}
                        initialDestinationRole={route?.initialDestinationRole}
                        finalDecisionOfficeRole={route?.finalDecisionOfficeRole}
                        auditEvents={route?.auditEvents ?? []}
                        routeLoadFailed={route?.loadFailed ?? false}
                      />
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </div>

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
                  onClick={async () => {
                    const url = await getFileUrl(supabase, previewFile);
                    await downloadFile(url, previewFile.file_name);
                  }}
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

function StatusBadge({ status }: { status: string }) {
  const getStatusDisplay = (raw: string) => {
    const s = (raw || '').toLowerCase();
    if (s.startsWith('declined') || s === 'rejected') {
      return { label: 'REJECTED', styles: 'bg-rejected-bg text-rejected-text' };
    }
    const styles = ['completed', 'approved'].includes(s)
      ? 'bg-approved-bg text-approved-text'
      : ['in_process', 'pending_office', 'pending_mayor'].includes(s)
        ? 'bg-review-bg text-review-text'
        : ['returned', 'changes_requested', 'returned_for_requirements', 'submitted', 'pending', 'pending_approver'].includes(s)
          ? 'bg-pending-bg text-pending-text'
          : 'bg-sidebar text-muted-text';
    return { label: getSubmissionStatusLabel(s).toUpperCase(), styles };
  };

  const { label, styles } = getStatusDisplay(status);

  return (
    <span className={`inline-flex items-center gap-2 whitespace-nowrap rounded-full px-3 py-1.5 text-[11px] font-medium ${styles}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {label}
    </span>
  );
}