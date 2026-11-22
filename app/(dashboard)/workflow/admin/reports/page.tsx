'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { getWorkflowTiming } from '@/lib/workflow/timing';
import { getSubmissionStatusLabel } from '@/lib/workflow/status';
import {
  calculateWorkflowReportAverages,
  formatReportDuration,
} from '@/lib/workflow/report-metrics';

// ─── Styles ──────────────────────────────────────────────────────────────────
const fonts = {
  serif: 'font-serif',
};

const fieldClasses =
  'h-11 w-full rounded-full border border-warm-border bg-card px-4 text-xs text-warm-text caret-current outline-none transition-colors focus:border-clay';

interface SubmissionReportRow {
  id: string;
  tracking_number: string | null;
  file_name: string;
  status: string;
  created_at: string;
  updated_at: string;
  verified_at: string | null;
  office_reviewed_at: string | null;
  approved_at: string | null;
  completed_at: string | null;
  current_stage_due_at: string | null;
  auditLogs: {
    action_type: string;
    created_at: string;
  }[];
}

const IN_PROGRESS_STATUSES = new Set([
  'submitted',
  'pending',
  'pending_approver',
  'pending_admin',
  'pending_office',
  'pending_mayor',
  'in_process',
]);

const REJECTED_OR_RETURNED_STATUSES = new Set([
  'returned',
  'returned_for_requirements',
  'changes_requested',
  'declined_by_approver',
  'declined_by_admin',
  'declined_by_office',
  'declined_by_mayor',
  'rejected',
]);

const REPORT_STATUS_LABELS: Record<string, string> = {
  pending_admin: 'Pending approval',
  declined_by_approver: 'Returned for correction',
  declined_by_admin: 'Rejected by administrator',
  declined_by_office: 'Rejected by office',
  declined_by_mayor: 'Rejected by mayor',
  returned_for_requirements: 'Returned for requirements',
  changes_requested: 'Changes requested',
};

const getStatusClasses = (status: string) => {
  const s = (status || '').toLowerCase();
  if (s === 'pending' || s === 'pending_approver') return 'bg-pending-bg text-pending-text';
  if (s === 'pending_admin') return 'bg-review-bg text-review-text';
  if (s === 'approved' || s === 'completed') return 'bg-approved-bg text-approved-text';
  if (s.includes('declined') || s === 'rejected') return 'bg-rejected-bg text-rejected-text';
  return 'bg-sidebar text-muted-text';
};

// ─── Small building blocks ───────────────────────────────────────────────────
function StatCard({ label, value, alert = false }: { label: string; value: string | number; alert?: boolean }) {
  return (
    <div className={`rounded-2xl border p-5 max-md:p-3.5 ${alert ? 'border-rejected-bg bg-rejected-bg/50' : 'border-warm-border bg-card'}`}>
      <p className="mb-2 text-[11px] font-medium text-muted-text">{label}</p>
      <p className={`${fonts.serif} text-[32px] leading-none max-md:text-[26px] ${alert ? 'text-rejected-text' : 'text-warm-text'}`}>{value}</p>
    </div>
  );
}

export default function ReportsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<SubmissionReportRow[]>([]);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchReport = useCallback(async () => {
    setError(null);

    const { data, error: queryError } = await supabase
      .from('workflow_submissions')
      .select('id, tracking_number, file_name, status, created_at, updated_at, verified_at, office_reviewed_at, approved_at, completed_at, current_stage_due_at, workflow_audit_logs(action_type, created_at)')
      .order('created_at', { ascending: false });

    if (queryError) {
      setError(queryError.message);
      setRows([]);
    } else {
      setRows((data || []).map((row) => ({
        ...row,
        auditLogs: row.workflow_audit_logs || [],
      })));
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (active) void fetchReport();
    });
    return () => {
      active = false;
    };
  }, [fetchReport]);

  const filteredRows = useMemo(() => rows.filter((row) => {
    const createdDate = row.created_at.slice(0, 10);
    return (!fromDate || createdDate >= fromDate) && (!toDate || createdDate <= toDate);
  }), [fromDate, rows, toDate]);

  const reportAverages = useMemo(
    () => calculateWorkflowReportAverages(filteredRows),
    [filteredRows]
  );

  const overdueRows = useMemo(
    () => filteredRows.filter((row) => getWorkflowTiming(row).state === 'overdue'),
    [filteredRows]
  );

  const exportCsv = () => {
    const header = ['Tracking Number', 'Document', 'Status', 'Submitted At', 'Last Updated', 'Audit Events'];
    const lines = filteredRows.map((row) => [
      row.tracking_number || '',
      row.file_name,
      REPORT_STATUS_LABELS[row.status] || getSubmissionStatusLabel(row.status),
      row.created_at,
      row.updated_at,
      row.auditLogs.length,
    ].map((value) => `"${String(value).replaceAll('"', '""')}"`).join(','));
    const csv = [header.join(','), ...lines].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `workflow-report-${fromDate || 'all'}-${toDate || 'all'}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const reportCards = [
    { label: 'Total submissions', value: filteredRows.length },
    { label: 'In progress', value: filteredRows.filter((row) => IN_PROGRESS_STATUSES.has(row.status)).length },
    { label: 'Completed', value: filteredRows.filter((row) => row.status === 'completed' || row.status === 'approved').length },
    { label: 'Rejected / returned', value: filteredRows.filter((row) => REJECTED_OR_RETURNED_STATUSES.has(row.status)).length },
    { label: 'Avg. time to review', value: formatReportDuration(reportAverages.timeToReview) },
    { label: 'Avg. review to decision', value: formatReportDuration(reportAverages.reviewToDecision) },
    { label: 'Avg. time to completion', value: formatReportDuration(reportAverages.timeToCompletion) },
    { label: 'Overdue', value: overdueRows.length, alert: overdueRows.length > 0 },
  ];

  const hasDateFilter = !!fromDate || !!toDate;

  return (
    <div className="w-full">
      {/* Header */}
      <div className="mb-8 max-md:mb-5">
        <p className="mb-3 flex items-center gap-2 text-[11px] font-medium text-muted-text max-md:mb-2">
          <span className="h-1.5 w-1.5 rounded-full bg-clay" /> Admin workspace
        </p>
        <h1 className={`${fonts.serif} text-[32px] leading-tight text-warm-text max-md:text-[26px]`}>Reports</h1>
        <p className="mt-2 text-xs text-muted-text max-md:mt-1.5">
          Workflow analytics. Covering <span className="text-warm-text">{filteredRows.length}</span> submissions.
        </p>
      </div>

      {/* Filters */}
      <div className="mb-6 max-md:mb-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label htmlFor="report-from" className="mb-1.5 block text-[11px] font-medium text-muted-text">From</label>
            <input id="report-from" type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} className={fieldClasses} />
          </div>
          <div>
            <label htmlFor="report-to" className="mb-1.5 block text-[11px] font-medium text-muted-text">To</label>
            <input id="report-to" type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} className={fieldClasses} />
          </div>
          <div className="flex items-end gap-3 sm:col-span-2 max-md:flex-col max-md:items-stretch">
            <button
              onClick={exportCsv}
              disabled={loading || filteredRows.length === 0}
              className="inline-flex h-11 flex-1 items-center justify-center rounded-full bg-clay px-6 text-xs font-semibold text-white transition-colors hover:bg-warm-text disabled:opacity-50 sm:flex-none"
            >
              Export CSV
            </button>
            {hasDateFilter && (
              <button
                onClick={() => { setFromDate(''); setToDate(''); }}
                className="inline-flex h-11 flex-1 items-center justify-center rounded-full border border-warm-border px-6 text-xs font-medium text-warm-text transition-colors hover:bg-sidebar sm:flex-none"
              >
                Clear dates
              </button>
            )}
          </div>
        </div>
        {error && (
          <p className="mt-3 rounded-xl border border-rejected-bg bg-rejected-bg/50 px-4 py-3 text-xs font-medium text-rejected-text">
            Could not load the report: {error}
          </p>
        )}
      </div>

      {/* Stat cards */}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        {reportCards.map((card) => (
          <StatCard key={card.label} label={card.label} value={card.value} alert={card.alert} />
        ))}
      </div>

      {/* Report list header */}
      <div className="mb-4 flex items-center gap-3">
        <h2 className="text-sm font-semibold text-warm-text">Submission report</h2>
        <span className="rounded-md bg-sidebar px-2 py-1 text-[10px] font-medium text-muted-text">{filteredRows.length}</span>
      </div>

      {/* Report table */}
      {loading ? (
        <div className="flex items-center gap-3 rounded-2xl border border-warm-border bg-card px-5 py-8 text-xs text-muted-text">
          <span className="h-2 w-2 animate-pulse rounded-full bg-clay" /> Loading report...
        </div>
      ) : filteredRows.length === 0 ? (
        <div className="rounded-2xl border border-warm-border bg-card py-16 text-center">
          <p className={`${fonts.serif} text-2xl text-warm-text`}>Nothing here</p>
          <p className="mt-2 text-xs text-muted-text">No records found for this date range.</p>
          {hasDateFilter && (
            <button
              onClick={() => { setFromDate(''); setToDate(''); }}
              className="mt-5 inline-flex h-10 items-center rounded-full border border-warm-border px-5 text-xs font-medium text-warm-text transition-colors hover:bg-sidebar max-md:h-11"
            >
              Clear dates
            </button>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-warm-border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left">
              <thead>
                <tr className="border-b border-warm-border bg-sidebar text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-text">
                  <th className="px-5 py-3 max-md:px-3.5">Tracking number</th>
                  <th className="px-5 py-3 max-md:px-3.5">Document</th>
                  <th className="px-5 py-3 max-md:px-3.5">Stage</th>
                  <th className="px-5 py-3 max-md:px-3.5">Submitted</th>
                  <th className="px-5 py-3 max-md:px-3.5">Updated</th>
                  <th className="px-5 py-3 text-right max-md:px-3.5">Audit events</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-warm-border">
                {filteredRows.map((row) => (
                  <tr key={row.id} className="transition-colors hover:bg-sidebar/50">
                    <td className="whitespace-nowrap px-5 py-4 text-[11px] font-semibold text-clay max-md:px-3.5">
                      {row.tracking_number || 'Tracking pending'}
                    </td>
                    <td className="max-w-[260px] px-5 py-4 max-md:px-3.5">
                      <p className="truncate text-sm font-semibold text-warm-text">{row.file_name}</p>
                    </td>
                    <td className="px-5 py-4 max-md:px-3.5">
                      <span className={`inline-flex items-center gap-2 whitespace-nowrap rounded-full px-3 py-1.5 text-[11px] font-medium ${getStatusClasses(row.status)}`}>
                        <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
                        {REPORT_STATUS_LABELS[row.status] || getSubmissionStatusLabel(row.status)}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-[11px] text-muted-text max-md:px-3.5">
                      {new Date(row.created_at).toLocaleString()}
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-[11px] text-muted-text max-md:px-3.5">
                      {new Date(row.updated_at).toLocaleString()}
                    </td>
                    <td className="px-5 py-4 text-right max-md:px-3.5">
                      <span className="rounded-md bg-sidebar px-2 py-1 text-[10px] font-semibold text-muted-text">{row.auditLogs.length}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}