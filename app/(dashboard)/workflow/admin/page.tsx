'use client';
import { logClientError } from '@/lib/clientLogger';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import FileBrowserFilterSelect from '@/components/FileBrowserFilterSelect';
import FileBrowserPagination from '@/components/FileBrowserPagination';
import FilePreview, { downloadFile, getFileUrl } from '@/components/FilePreview';
import FileBrowserSortSelect from '@/components/FileBrowserSortSelect';
import { getWorkflowDocumentTypeLabel } from '@/lib/workflow/offices';
import { createClient } from '@/lib/supabase/client';
import {
  ADMIN_DOCUMENT_PAGE_SIZE,
  paginateFileBrowserItems,
  matchesFileBrowserFilter,
  sortFileBrowserSubmissions,
  type FileBrowserFilter,
  type FileBrowserSort,
} from '@/lib/workflow/file-browser';
import { getSubmissionStatusLabel, getSubmissionStatusTone } from '@/lib/workflow/status';
import Icon, { type IconName } from '@/components/ui/Icon';
import PageHero from '@/components/ui/PageHero';
import SkeletonRows from '@/components/ui/SkeletonRows';
import StatCard, { type StatTone } from '@/components/ui/StatCard';

type Role =
  | 'submitter'
  | 'tourism_officer'
  | 'system_admin'
  | 'municipal_treasurer'
  | 'mayor_office'
  | 'sangguniang_bayan';

interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  role: Role;
  created_at: string;
}

interface Submission {
  id: string;
  user_id: string;
  tracking_number: string | null;
  file_name: string;
  file_url: string;
  file_path: string | null;
  file_type: string | null;
  file_size: number | null;
  category: string | null;
  other_document_type: string | null;
  status: string;
  description: string | null;
  purpose: string | null;
  requested_action: string | null;
  intended_recipient: string | null;
  selected_office_role: string | null;
  created_at: string;
}

const PAGE_SIZE = 500;

function StatusStamp({ status }: { status: string }) {
  const value = status.toLowerCase();
  const tone = getSubmissionStatusTone(value);
  const declined = value.includes('declined') || value === 'rejected';
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
    <span className={`inline-flex items-center gap-2 whitespace-nowrap rounded-full px-3 py-1.5 text-[11px] font-medium capitalize ${styles}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {declined ? 'Rejected' : getSubmissionStatusLabel(value)}
    </span>
  );
}

async function fetchAllProfiles(supabase: ReturnType<typeof createClient>) {
  const profiles: Profile[] = [];

  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, email, full_name, role, created_at')
      .order('created_at', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(`Could not load user accounts: ${error.message}`);

    const page = (data ?? []) as Profile[];
    profiles.push(...page);
    if (page.length < PAGE_SIZE) return profiles;
  }
}

async function fetchAllSubmissions(supabase: ReturnType<typeof createClient>) {
  const submissions: Submission[] = [];

  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('workflow_submissions')
      .select('id, user_id, tracking_number, file_name, file_url, file_path, file_type, file_size, category, other_document_type, status, description, purpose, requested_action, intended_recipient, selected_office_role, created_at')
      .order('created_at', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(`Could not load submitted documents: ${error.message}`);

    const page = (data ?? []) as Submission[];
    submissions.push(...page);
    if (page.length < PAGE_SIZE) return submissions;
  }
}

export default function AdminDashboard() {
  const supabase = useMemo(() => createClient(), []);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [previewSubmission, setPreviewSubmission] = useState<Submission | null>(null);
  const [previewError, setPreviewError] = useState('');
  const [fileFilter, setFileFilter] = useState<FileBrowserFilter>('all');
  const [fileSearch, setFileSearch] = useState('');
  const [fileSort, setFileSort] = useState<FileBrowserSort>('newest');
  const [filePage, setFilePage] = useState(1);

  const fetchMonitoringData = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [nextProfiles, nextSubmissions] = await Promise.all([
        fetchAllProfiles(supabase),
        fetchAllSubmissions(supabase),
      ]);
      setProfiles(nextProfiles);
      setSubmissions(nextSubmissions);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not load monitoring data.';
      logClientError('Admin monitoring refresh failed:', message);
      setLoadError(message);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    void fetchMonitoringData();
    const profilesChannel = supabase
      .channel('admin-monitoring-profiles')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, fetchMonitoringData)
      .subscribe();
    const submissionsChannel = supabase
      .channel('admin-monitoring-submissions')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'workflow_submissions' }, fetchMonitoringData)
      .subscribe();

    return () => {
      void supabase.removeChannel(profilesChannel);
      void supabase.removeChannel(submissionsChannel);
    };
  }, [fetchMonitoringData, supabase]);

  const profilesById = useMemo(
    () => new Map(profiles.map((profile) => [profile.id, profile])),
    [profiles]
  );
  const filteredSubmissions = useMemo(() => {
    const query = fileSearch.trim().toLowerCase();
    return submissions.filter((submission) => {
      const profile = profilesById.get(submission.user_id);
      const matchesSearch = !query
        || submission.file_name.toLowerCase().includes(query)
        || (submission.tracking_number ?? '').toLowerCase().includes(query)
        || (profile?.email ?? '').toLowerCase().includes(query);
      return matchesSearch && matchesFileBrowserFilter(submission.status, fileFilter);
    });
  }, [fileFilter, fileSearch, profilesById, submissions]);
  const sortedSubmissions = useMemo(
    () => sortFileBrowserSubmissions(filteredSubmissions, fileSort),
    [fileSort, filteredSubmissions]
  );
  const paginatedSubmissions = useMemo(
    () => paginateFileBrowserItems(sortedSubmissions, filePage, ADMIN_DOCUMENT_PAGE_SIZE),
    [filePage, sortedSubmissions]
  );
  const downloadPreview = async () => {
    if (!previewSubmission) return;
    setPreviewError('');
    try {
      await downloadFile(await getFileUrl(supabase, previewSubmission), previewSubmission.file_name);
    } catch (error) {
      logClientError('Admin document download failed:', error);
      setPreviewError(error instanceof Error ? error.message : 'Could not download this document.');
    }
  };
  const pendingCount = submissions.filter((submission) =>
    ['pending', 'pending_approver', 'pending_admin', 'pending_office', 'pending_mayor']
      .includes(submission.status.toLowerCase())
  ).length;
  const completedCount = submissions.filter((submission) => submission.status.toLowerCase() === 'completed').length;
  const statCards: { label: string; value: number; hint: string; icon: IconName; tone: StatTone }[] = [
    { label: 'Accounts monitored', value: profiles.length, hint: 'All registered roles', icon: 'users', tone: 'primary' },
    { label: 'Submitted documents', value: submissions.length, hint: 'Across the system', icon: 'files', tone: 'review' },
    { label: 'In progress', value: pendingCount, hint: 'Awaiting a workflow step', icon: 'hourglass', tone: 'pending' },
    { label: 'Completed', value: completedCount, hint: 'Finished workflow requests', icon: 'file-check', tone: 'approved' },
  ];

  return (
    <div className="w-full">
      <PageHero
        eyebrow="Admin workspace"
        icon="shield-check"
        title="System monitoring"
        description={
          pendingCount > 0
            ? `${pendingCount} request${pendingCount === 1 ? '' : 's'} still moving through the workflow. Monitor accounts by role and track every submitted document.`
            : 'Monitor accounts by role and track every submitted document.'
        }
      />

      {loadError && (
        <div role="alert" className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rejected-bg bg-rejected-bg/50 px-4 py-3 text-xs text-rejected-text">
          <span>{loadError}</span>
          <button type="button" onClick={() => void fetchMonitoringData()} className="font-semibold underline">Retry</button>
        </div>
      )}

      <section aria-label="System totals" className="ui-stagger mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 max-md:mb-6 max-md:gap-3">
        {statCards.map((card) => (
          <StatCard
            key={card.label}
            label={card.label}
            value={card.value}
            hint={card.hint}
            icon={card.icon}
            tone={card.tone}
            loading={loading && submissions.length === 0}
          />
        ))}
      </section>

      <section>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-warm-text">Submitted documents</h2>
            <p className="mt-1 text-[11px] text-muted-text">
              Showing {paginatedSubmissions.start}–{paginatedSubmissions.end} of {filteredSubmissions.length} matching files. Search by document name, tracking number, or requester.
            </p>
          </div>
          <Link href="/workflow/admin/submissions" className="text-xs font-semibold text-clay underline underline-offset-4">
            Open full file registry
          </Link>
        </div>

        {loading && submissions.length === 0 ? (
          <SkeletonRows rows={3} label="Loading submitted documents…" />
        ) : submissions.length === 0 ? (
          <div className="ui-fade-up rounded-2xl border border-warm-border bg-card py-14 text-center">
            <span className="ui-float mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-clay-soft text-clay">
              <Icon name="inbox" size={26} />
            </span>
            <p className="font-serif text-2xl text-warm-text">No submissions yet</p>
            <p className="mt-2 text-xs text-muted-text">New user documents will appear here.</p>
          </div>
        ) : (
          <>
            <div className="mb-4 space-y-3">
              <div className="relative">
                <span className="pointer-events-none absolute left-5 top-1/2 z-10 flex -translate-y-1/2 items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-text">
                  <Icon name="search" size={15} /> SEARCH //
                </span>
                <input
                  type="search"
                  value={fileSearch}
                  onChange={(event) => {
                    setFileSearch(event.target.value);
                    setFilePage(1);
                  }}
                  aria-label="Search files by name, tracking number, or requester email"
                  placeholder="Find a file by name..."
                  className="h-12 w-full rounded-full border border-warm-border bg-card pl-32 pr-5 text-sm text-warm-text outline-none transition-colors placeholder:text-muted-text/60 focus:border-clay max-md:h-11"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <FileBrowserFilterSelect
                  value={fileFilter}
                  onChange={(value) => {
                    setFileFilter(value);
                    setFilePage(1);
                  }}
                />
                <FileBrowserSortSelect
                  value={fileSort}
                  onChange={(value) => {
                    setFileSort(value);
                    setFilePage(1);
                  }}
                />
              </div>
            </div>

            {filteredSubmissions.length === 0 ? (
              <div className="rounded-2xl border border-warm-border bg-card py-16 text-center">
                <p className="font-serif text-2xl text-warm-text">Nothing here</p>
                <p className="mt-2 text-xs text-muted-text">No files match your search or filters.</p>
              </div>
            ) : <>
            <div className="ui-stagger space-y-3">
            {paginatedSubmissions.items.map((submission) => {
              const profile = profilesById.get(submission.user_id);
              return (
                <article
                  key={submission.id}
                  className="group grid grid-cols-1 gap-4 rounded-2xl border border-warm-border bg-card px-5 py-5 ui-lift hover:border-clay-border sm:grid-cols-12 max-md:gap-3 max-md:px-3.5 max-md:py-3.5"
                >
                  <div className="flex min-w-0 items-center gap-4 sm:col-span-8">
                    <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-sidebar text-muted-text">
                      <Icon name="file" size={18} className="transition-transform duration-300 group-hover:-translate-y-0.5" />
                      <span className="mt-1 text-[8px] font-semibold uppercase">{submission.file_type?.split('/').at(-1)?.slice(0, 3) || 'File'}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="mb-1.5 flex flex-wrap items-center gap-2">
                        <span className="rounded-md bg-clay-soft px-2 py-1 text-[10px] font-medium text-clay">
                          {getWorkflowDocumentTypeLabel(submission.category, submission.other_document_type)}
                        </span>
                        <span className="text-[11px] text-muted-text">ID: {submission.id.slice(0, 8)}</span>
                      </div>
                      <h3 className="truncate text-sm font-semibold text-warm-text group-hover:text-clay">{submission.file_name}</h3>
                      <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1">
                        <div className="flex flex-col">
                          <span className="text-[10px] font-medium text-muted-text">Date uploaded</span>
                          <span className="text-[11px] text-warm-text">{new Date(submission.created_at).toLocaleDateString()}</span>
                        </div>
                        {submission.file_size ? (
                          <div className="flex flex-col border-l border-warm-border pl-5">
                            <span className="text-[10px] font-medium text-muted-text">Size</span>
                            <span className="text-[11px] text-warm-text">{(submission.file_size / 1024).toFixed(1)} KB</span>
                          </div>
                        ) : null}
                        <div className="flex flex-col border-l border-warm-border pl-5">
                          <span className="text-[10px] font-medium text-muted-text">Requester</span>
                          <span className="max-w-56 truncate text-[11px] text-warm-text">{profile?.email || 'Not available'}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 sm:col-span-4 sm:justify-end max-md:w-full max-md:flex-col max-md:items-stretch">
                    <div className="flex flex-col items-start gap-1.5 sm:items-end max-md:self-start">
                      <span className="text-[10px] font-medium text-muted-text">Current status</span>
                      <StatusStamp status={submission.status} />
                    </div>
                    <div className="flex items-center gap-2 max-md:w-full max-md:flex-col max-md:items-stretch">
                      <button
                        type="button"
                        onClick={() => {
                          setPreviewError('');
                          setPreviewSubmission(submission);
                        }}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-warm-border text-warm-text transition-colors hover:bg-sidebar max-md:h-11 max-md:w-full"
                        title="Quick preview"
                        aria-label={`Preview ${submission.file_name}`}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
                        </svg>
                      </button>
                      <Link
                        href={`/workflow/admin/submissions/${submission.id}`}
                        className="inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-full bg-clay px-5 text-xs font-semibold text-white transition-colors hover:bg-warm-text max-md:h-11 max-md:w-full"
                      >
                        View document <span aria-hidden="true">→</span>
                      </Link>
                    </div>
                  </div>
                </article>
              );
            })}
            </div>
            <FileBrowserPagination
              start={paginatedSubmissions.start}
              end={paginatedSubmissions.end}
              totalItems={filteredSubmissions.length}
              page={paginatedSubmissions.page}
              totalPages={paginatedSubmissions.totalPages}
              onPageChange={setFilePage}
            />
            </>}
          </>
        )}
      </section>

      {previewSubmission && (
        <div
          className="fixed inset-0 z-100 flex items-center justify-center bg-warm-text/75 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="submission-preview-title"
        >
          <div className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-warm-border bg-card shadow-xl">
            <header className="flex items-center justify-between gap-4 border-b border-warm-border px-5 py-4">
              <div className="min-w-0">
                <h2 id="submission-preview-title" className="truncate text-sm font-semibold text-warm-text">{previewSubmission.file_name}</h2>
                <p className="mt-1 text-[11px] text-muted-text">
                  {profilesById.get(previewSubmission.user_id)?.email || 'Unknown requestee'} · {previewSubmission.tracking_number || 'Tracking pending'}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => void downloadPreview()}
                  className="inline-flex h-10 items-center rounded-full border border-warm-border px-4 text-[11px] font-medium text-warm-text transition-colors hover:bg-sidebar"
                >
                  Download
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewSubmission(null)}
                  aria-label="Close document preview"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg text-muted-text hover:bg-sidebar"
                >
                  ×
                </button>
              </div>
            </header>
            {previewError && (
              <p role="alert" className="border-b border-rejected-bg bg-rejected-bg/50 px-4 py-2 text-xs text-rejected-text">
                {previewError}
              </p>
            )}
            <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
              <div className="min-h-80 rounded-xl border border-warm-border bg-white p-3">
                <FilePreview file={previewSubmission} />
              </div>
              <aside className="space-y-4 text-xs">
                <div>
                  <p className="mb-1 text-[11px] font-medium text-muted-text">Status</p>
                  <StatusStamp status={previewSubmission.status} />
                </div>
                <div>
                  <p className="mb-1 text-[11px] font-medium text-muted-text">Description</p>
                  <p className="whitespace-pre-wrap break-words leading-relaxed text-warm-text">{previewSubmission.description || 'No description provided.'}</p>
                </div>
                {previewSubmission.purpose && (
                  <div>
                    <p className="mb-1 text-[11px] font-medium text-muted-text">Purpose</p>
                    <p className="whitespace-pre-wrap break-words leading-relaxed text-warm-text">{previewSubmission.purpose}</p>
                  </div>
                )}
                {previewSubmission.requested_action && (
                  <div>
                    <p className="mb-1 text-[11px] font-medium text-muted-text">Requested action</p>
                    <p className="whitespace-pre-wrap break-words leading-relaxed text-warm-text">{previewSubmission.requested_action}</p>
                  </div>
                )}
                {previewSubmission.intended_recipient && (
                  <div>
                    <p className="mb-1 text-[11px] font-medium text-muted-text">Intended recipient</p>
                    <p className="whitespace-pre-wrap break-words leading-relaxed text-warm-text">{previewSubmission.intended_recipient}</p>
                  </div>
                )}
                <Link
                  href={`/workflow/admin/submissions/${previewSubmission.id}`}
                  className="inline-flex h-10 w-full items-center justify-center rounded-full bg-clay px-4 text-xs font-semibold text-white"
                >
                  Open full record
                </Link>
              </aside>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
