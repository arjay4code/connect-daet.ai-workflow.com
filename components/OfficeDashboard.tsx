'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import FilePreview, { downloadFile, getFileUrl } from '@/components/FilePreview';
import FileBrowserFilterSelect from '@/components/FileBrowserFilterSelect';
import { createClient } from '@/lib/supabase/client';
import { useWorkflowRole } from '@/lib/workflow/role-context';
import {
  getWorkflowDocumentTypeLabel,
  getOfficeArchivePath,
  getOfficeFileManagementPath,
  OFFICE_CONFIG,
  type OfficeRole,
} from '@/lib/workflow/offices';
import {
  matchesOfficeDashboardFilter,
} from '@/lib/workflow/office-dashboard';
import {
  getDashboardSubmissionPreview,
  matchesOfficeFileBrowserFilter,
  type FileBrowserFilter,
} from '@/lib/workflow/file-browser';
import { getSubmissionStatusLabel } from '@/lib/workflow/status';
import {
  summarizeAssignment,
} from '@/lib/workflow/assignments';

interface Submission {
  id: string;
  tracking_number: string | null;
  file_name: string;
  file_url: string;
  file_path: string | null;
  file_type: string | null;
  file_size: number | null;
  category: string | null;
  other_document_type: string | null;
  status: string;
  reopen_count: number | null;
  created_at: string;
  selected_office_role: string | null;
  initial_destination_role: string | null;
  officeRecord: {
    status: string;
    comments: string | null;
    decided_at: string | null;
    completed_at: string | null;
  } | null;
  consultedRecord: {
    office_role: string;
    status: string;
    outcome: string | null;
  } | null;
}

function statusLabel(status: string, assignment = false) {
  if (assignment && status === 'pending') return 'Pending assignment';
  if (assignment && status === 'in_progress') return 'In Progress';
  return getSubmissionStatusLabel(status);
}

export default function OfficeDashboard({
  role,
  view,
}: {
  role: OfficeRole;
  view: 'dashboard' | 'file-management';
}) {
  const office = OFFICE_CONFIG[role];
  const viewerRole = useWorkflowRole();
  const officePath = getOfficeFileManagementPath(role);
  const adminOfficeQuery = viewerRole === 'system_admin' ? `?office=${role}` : '';
  const officeQueuePath = `${officePath}${adminOfficeQuery}`;
  const officeArchivePath = `${getOfficeArchivePath(role)}${adminOfficeQuery}`;
  const officeSubmissionPath = (submissionId: string) =>
    `${officePath}/${submissionId}${adminOfficeQuery}`;
  const supabase = useMemo(() => createClient(), []);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [filter, setFilter] = useState<FileBrowserFilter>('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [previewFile, setPreviewFile] = useState<Submission | null>(null);
  const [previewError, setPreviewError] = useState('');

  useEffect(() => {
    if (!previewFile) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPreviewFile(null);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [previewFile]);

  const fetchSubmissions = useCallback(async () => {
    const { data: plans, error: plansError } = await supabase
      .from('workflow_routing_plans')
      .select('id, submission_id, version, is_current')
      .in('status', ['finalized', 'superseded'])
      .order('created_at', { ascending: false })
      .limit(500);

    if (plansError) {
      console.error('Office route history load failed:', plansError.message);
      setError('Could not load this office’s document history. Please try again.');
      setLoading(false);
      return;
    }
    setError('');

    const planById = new Map((plans ?? []).map((plan) => [plan.id, plan]));
    const planIds = (plans ?? []).map((plan) => plan.id);
    let routeSteps: {
      routing_plan_id: string;
      office_role: string;
      assigned_by_role: string | null;
      status: string;
      outcome: string | null;
      comments: string | null;
      decided_at: string | null;
      completed_at: string | null;
    }[] = [];

    if (planIds.length > 0) {
      const { data: steps, error: stepsError } = await supabase
        .from('workflow_routing_steps')
        .select('routing_plan_id, office_role, assigned_by_role, status, outcome, comments, decided_at, completed_at')
        .or(`office_role.eq.${role},assigned_by_role.eq.${role}`)
        .neq('status', 'skipped')
        .in('routing_plan_id', planIds);

      if (stepsError) {
        console.error('Office route steps load failed:', stepsError.message);
        setError('Could not load this office’s processing history. Please try again.');
        setLoading(false);
        return;
      }

      routeSteps = steps ?? [];
    }

    const officeRecords = new Map<
      string,
      { status: string; comments: string | null; decided_at: string | null; completed_at: string | null; version: number }
    >();
    // Assignments this office gave to another office (latest per submission).
    const consultedRecords = new Map<
      string,
      { office_role: string; status: string; outcome: string | null; version: number }
    >();
    for (const step of routeSteps) {
      const plan = planById.get(step.routing_plan_id);
      if (!plan) continue;

      if (step.office_role !== role) {
        const consulted = consultedRecords.get(plan.submission_id);
        if (!consulted || plan.version > consulted.version) {
          consultedRecords.set(plan.submission_id, {
            office_role: step.office_role,
            status: step.status,
            outcome: step.outcome,
            version: plan.version,
          });
        }
        continue;
      }

      const existing = officeRecords.get(plan.submission_id);
      if (!existing || plan.version > existing.version) {
        officeRecords.set(plan.submission_id, {
          status: step.status,
          comments: step.comments,
          decided_at: step.decided_at,
          completed_at: step.completed_at,
          version: plan.version,
        });
      }
    }
    const activeRouteSubmissionIds = routeSteps
      .filter((step) => step.status === 'pending' || step.status === 'in_progress')
      .map((step) => planById.get(step.routing_plan_id))
      .filter((plan): plan is NonNullable<typeof plan> => Boolean(plan?.is_current))
      .map((plan) => plan.submission_id);

    let currentAssignmentsQuery = supabase
      .from('workflow_submissions')
      .select('id')
      .order('created_at', { ascending: false })
      .limit(200);
    currentAssignmentsQuery = currentAssignmentsQuery.eq('selected_office_role', role);
    const { data: currentAssignments, error: assignmentsError } = await currentAssignmentsQuery;

    if (assignmentsError) {
      console.error('Office dashboard assignments load failed:', assignmentsError.message);
      setError('Could not load this office’s documents. Please try again.');
      setLoading(false);
      return;
    }

    const submissionIds = Array.from(new Set([
      ...officeRecords.keys(),
      ...consultedRecords.keys(),
      ...activeRouteSubmissionIds,
      ...(currentAssignments ?? []).map((submission) => submission.id),
    ]));

    if (submissionIds.length === 0) {
      setSubmissions([]);
      setLoading(false);
      return;
    }

    const { data, error: fetchError } = await supabase
      .from('workflow_submissions')
      .select('id, tracking_number, file_name, file_url, file_path, file_type, file_size, category, other_document_type, status, reopen_count, created_at, selected_office_role, initial_destination_role')
      .in('id', submissionIds)
      .order('created_at', { ascending: false })
      .limit(200);

    if (fetchError) {
      console.error('Office dashboard history load failed:', fetchError.message);
      setError('Could not load this office’s documents. Please try again.');
      setLoading(false);
      return;
    }

    setSubmissions((data ?? []).map((submission) => {
      const officeRecord = officeRecords.get(submission.id);
      const consultedRecord = consultedRecords.get(submission.id);
      return {
        ...submission,
        consultedRecord: consultedRecord && ['in_process', 'changes_requested'].includes(submission.status)
          ? {
              office_role: consultedRecord.office_role,
              status: consultedRecord.status,
              outcome: consultedRecord.outcome,
            }
          : null,
        officeRecord: officeRecord
          ? {
              status: officeRecord.status,
              comments: officeRecord.comments,
              decided_at: officeRecord.decided_at,
              completed_at: officeRecord.completed_at,
            }
          : submission.selected_office_role === role && submission.status === 'completed'
              ? { status: 'completed', comments: null, decided_at: null, completed_at: null }
              : null,
      };
    }));
    setLoading(false);
  }, [role, supabase]);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (active) void fetchSubmissions();
    });
    return () => {
      active = false;
    };
  }, [fetchSubmissions]);

  useEffect(() => {
    const refreshOnFocus = () => {
      if (document.visibilityState === 'visible') void fetchSubmissions();
    };
    window.addEventListener('focus', refreshOnFocus);
    return () => window.removeEventListener('focus', refreshOnFocus);
  }, [fetchSubmissions]);

  const filteredSubmissions = useMemo(() => {
    const query = search.trim().toLowerCase();
    return submissions.filter((submission) => {
      const matchesSearch =
        !query ||
        submission.file_name.toLowerCase().includes(query) ||
        (submission.tracking_number ?? '').toLowerCase().includes(query) ||
        (submission.category ?? '').toLowerCase().includes(query);
      return matchesSearch && matchesOfficeFileBrowserFilter(submission, filter, role);
    });
  }, [filter, role, search, submissions]);
  const fileListSubmissions = filteredSubmissions;

  const downloadPreview = async () => {
    if (!previewFile) return;
    setPreviewError('');
    try {
      await downloadFile(await getFileUrl(supabase, previewFile), previewFile.file_name);
    } catch (downloadError) {
      console.error('Office document download failed:', downloadError);
      setPreviewError(downloadError instanceof Error ? downloadError.message : 'Could not download this document.');
    }
  };

  const needsReview = submissions.filter((submission) =>
    matchesOfficeDashboardFilter(submission, 'needs_action', role)
  ).length;
  const completed = submissions.filter((submission) =>
    matchesOfficeDashboardFilter(submission, 'completed', role)
  ).length;
  const recentActionItems = getDashboardSubmissionPreview(
    submissions.filter((submission) => matchesOfficeDashboardFilter(submission, 'needs_action', role))
  );

  return (
    <div className="w-full">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-3 flex items-center gap-2 text-[11px] font-medium text-muted-text">
            <span className="h-1.5 w-1.5 rounded-full bg-clay" /> Office workspace
          </p>
          <h1 className="font-serif text-[32px] leading-tight text-warm-text max-md:text-[26px]">
            {view === 'dashboard' ? `${office.label} dashboard` : 'File management'}
          </h1>
          <p className="mt-2 text-xs text-muted-text">
            {view === 'dashboard'
              ? 'Review your office workload and continue processing documents that need action.'
              : 'Search, filter, and review documents routed to or processed by your office.'}
          </p>
        </div>
        {view === 'file-management' && (
          <Link
            href={officeArchivePath}
            className="inline-flex h-11 items-center justify-center rounded-full border border-warm-border bg-card px-5 text-xs font-semibold text-warm-text transition-colors hover:bg-sidebar"
          >
            Archive
          </Link>
        )}
      </header>

      {view === 'dashboard' ? (
        <>
          <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {[
              { label: 'Needs action', value: needsReview, hint: 'Responsible submissions and active assignments' },
              { label: 'Completed', value: completed, hint: 'Finished submissions' },
              { label: 'In office history', value: submissions.length, hint: 'Current and previously routed documents' },
            ].map((stat) => (
              <section key={stat.label} className="rounded-2xl border border-warm-border bg-card p-5">
                <h2 className="text-xs font-medium text-muted-text">{stat.label}</h2>
                <p className="mt-3 font-serif text-[34px] leading-none text-warm-text">{stat.value}</p>
                <p className="mt-3 text-[11px] text-muted-text">{stat.hint}</p>
              </section>
            ))}
          </div>

          <section className="rounded-2xl border border-warm-border bg-card p-5 max-md:px-3.5">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-warm-text">Needs your attention</h2>
                <p className="mt-1 text-[11px] text-muted-text">The next submissions and assignments to process.</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void fetchSubmissions()}
                  disabled={loading}
                  className="h-10 rounded-full border border-warm-border bg-card px-4 text-xs font-medium text-warm-text hover:bg-sidebar disabled:opacity-50"
                >
                  {loading ? 'Refreshing...' : 'Refresh'}
                </button>
                <Link
                  href={officeQueuePath}
                  className="inline-flex h-10 items-center justify-center rounded-full bg-clay px-4 text-xs font-semibold text-white transition-colors hover:bg-warm-text"
                >
                  File management <span className="ml-2" aria-hidden="true">→</span>
                </Link>
              </div>
            </div>

            {error ? (
              <div role="alert" className="rounded-xl border border-rejected-bg bg-rejected-bg/50 px-4 py-4 text-xs text-rejected-text">
                <p>{error}</p>
                <button type="button" onClick={() => void fetchSubmissions()} className="mt-3 font-semibold underline">
                  Retry
                </button>
              </div>
            ) : loading ? (
              <p className="rounded-xl bg-sidebar px-4 py-6 text-xs text-muted-text">Loading your office overview...</p>
            ) : recentActionItems.length === 0 ? (
              <div className="rounded-xl bg-sidebar px-4 py-8 text-center">
                <p className="font-serif text-xl text-warm-text">You’re all caught up</p>
                <p className="mt-2 text-xs text-muted-text">There are no submissions or assignments requiring action right now.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {recentActionItems.map((submission) => {
                  return (
                    <article
                      key={submission.id}
                      className="flex flex-col gap-3 rounded-xl border border-warm-border bg-card px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="truncate text-sm font-semibold text-warm-text">{submission.file_name}</h3>
                          {(submission.reopen_count ?? 0) > 0 && (
                            <span className="rounded-full bg-review-bg px-2.5 py-1 text-[9px] font-semibold text-review-text">
                              Resubmitted
                            </span>
                          )}
                        </div>
                        <p className="mt-1 flex flex-wrap gap-x-2 text-[11px] text-muted-text">
                          <span>{submission.tracking_number || 'Tracking number pending'}</span>
                          <span aria-hidden="true">·</span>
                          <span>{getWorkflowDocumentTypeLabel(submission.category, submission.other_document_type)}</span>
                          <span aria-hidden="true">·</span>
                          <span>{new Date(submission.created_at).toLocaleDateString()}</span>
                        </p>
                        {submission.officeRecord && (
                          <p className="mt-1 text-[11px] text-muted-text">
                            This office: {statusLabel(submission.officeRecord.status, true)}
                          </p>
                        )}
                        {submission.consultedRecord && (
                          <p className="mt-1 text-[11px] font-semibold text-clay">
                            {summarizeAssignment(submission.consultedRecord)}
                          </p>
                        )}
                      </div>
                      <Link
                        href={officeSubmissionPath(submission.id)}
                        className="inline-flex h-10 shrink-0 items-center justify-center rounded-full bg-clay px-5 text-xs font-semibold text-white transition-colors hover:bg-warm-text"
                      >
                        View
                      </Link>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </>
      ) : (
        <section>
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <label className="relative w-full lg:max-w-xl lg:flex-1" htmlFor="office-search">
              <span className="pointer-events-none absolute left-5 top-1/2 z-10 -translate-y-1/2 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-text">SEARCH //</span>
              <input
                id="office-search"
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Find a file by name..."
                className="h-12 w-full rounded-full border border-warm-border bg-card pl-28 pr-5 text-sm text-warm-text outline-none transition-colors placeholder:text-muted-text/60 focus:border-clay max-md:h-11"
              />
            </label>
            <FileBrowserFilterSelect value={filter} onChange={setFilter} />
            <button
              type="button"
              onClick={() => void fetchSubmissions()}
              disabled={loading}
              className="h-12 shrink-0 self-start rounded-full border border-warm-border bg-card px-4 text-xs font-medium text-warm-text hover:bg-sidebar disabled:opacity-50 lg:self-auto max-md:h-11"
            >
              {loading ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>

          {error ? (
            <div role="alert" className="rounded-2xl border border-rejected-bg bg-rejected-bg/50 px-5 py-6 text-xs text-rejected-text">
              <p>{error}</p>
              <button type="button" onClick={() => void fetchSubmissions()} className="mt-3 font-semibold underline">
                Retry
              </button>
            </div>
          ) : loading ? (
            <div className="rounded-2xl border border-warm-border bg-card px-5 py-8 text-xs text-muted-text">
              Loading files...
            </div>
          ) : (
            <>
              <div className="mb-4 flex items-center gap-3">
                <h2 className="text-sm font-semibold text-warm-text">Office files</h2>
                <span className="rounded-md bg-sidebar px-2 py-1 text-[10px] font-medium text-muted-text">{fileListSubmissions.length}</span>
              </div>
              {fileListSubmissions.length === 0 ? (
                <div className="rounded-2xl border border-warm-border bg-card py-16 text-center">
                  <p className="font-serif text-2xl text-warm-text">Nothing here</p>
                  <p className="mt-2 text-xs text-muted-text">
                    No files match your search or filters.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {fileListSubmissions.map((submission) => (
                    <article
                      key={submission.id}
                      className="group grid grid-cols-1 gap-4 rounded-2xl border border-warm-border bg-card px-5 py-5 transition-colors hover:border-clay-border sm:grid-cols-12 max-md:gap-3 max-md:px-3.5 max-md:py-3.5"
                    >
                      <div className="flex min-w-0 items-center gap-4 sm:col-span-8">
                        <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-sidebar text-muted-text">
                          <span className="text-lg leading-4" aria-hidden="true">▤</span>
                          <span className="mt-1 text-[8px] font-semibold uppercase">{submission.file_type?.split('/').at(-1)?.slice(0, 3) || 'File'}</span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="mb-1.5 flex flex-wrap items-center gap-2">
                            <span className="rounded-md bg-clay-soft px-2 py-1 text-[10px] font-medium text-clay">
                              {getWorkflowDocumentTypeLabel(submission.category, submission.other_document_type)}
                            </span>
                            <span className="text-[11px] text-muted-text">ID: {submission.id.slice(0, 8)}</span>
                            {(submission.reopen_count ?? 0) > 0 && (
                              <span className="rounded-full bg-review-bg px-2.5 py-1 text-[9px] font-semibold text-review-text">Resubmitted</span>
                            )}
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
                              <span className="text-[10px] font-medium text-muted-text">Reference number</span>
                              <span className="text-[11px] text-warm-text">{submission.tracking_number || 'Pending'}</span>
                            </div>
                          </div>
                          {submission.officeRecord && (
                            <p className="mt-2 text-[10px] text-muted-text">
                              This office: {statusLabel(submission.officeRecord.status, true)}
                            </p>
                          )}
                          {submission.consultedRecord && (
                            <p className="mt-1 text-[10px] font-semibold text-clay">
                              {summarizeAssignment(submission.consultedRecord)}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 sm:col-span-4 sm:justify-end max-md:w-full max-md:flex-col max-md:items-stretch">
                        <div className="flex flex-col items-start gap-1.5 sm:items-end max-md:self-start">
                          <span className="text-[10px] font-medium text-muted-text">Current status</span>
                          <span className="rounded-full bg-sidebar px-3 py-1.5 text-[11px] font-medium capitalize text-muted-text">
                            {statusLabel(submission.status)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 max-md:w-full max-md:flex-col max-md:items-stretch">
                          <button
                            type="button"
                            onClick={() => {
                              setPreviewError('');
                              setPreviewFile(submission);
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
                            href={officeSubmissionPath(submission.id)}
                            className="inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-full bg-clay px-5 text-xs font-semibold text-white transition-colors hover:bg-warm-text max-md:h-11 max-md:w-full"
                          >
                            View document <span aria-hidden="true">→</span>
                          </Link>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </>
          )}
        </section>
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
                  aria-label="Close document preview"
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
