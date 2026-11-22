'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  getPresenceStatus,
  PRESENCE_IDLE_THRESHOLD_MS,
  type PresenceSession,
  type PresenceStatus,
} from '@/lib/workflow/presence';
import Icon, { type IconName } from '@/components/ui/Icon';
import SkeletonRows from '@/components/ui/SkeletonRows';
import PageHero from '@/components/ui/PageHero';

const idleThresholdHours = PRESENCE_IDLE_THRESHOLD_MS / (60 * 60 * 1000);

interface Officer {
  id: string;
  email: string | null;
  full_name: string | null;
  role: string;
  is_active: boolean;
}

interface ActivityEvent {
  id: string;
  actor_id: string | null;
  actor_role: string;
  event_type: string;
  submission_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
  actor: { email: string | null; full_name: string | null } | null;
}

interface MonitoringData {
  officers: Officer[];
  presenceSessions: PresenceSession[];
  events: ActivityEvent[];
}

function statusStyles(status: PresenceStatus) {
  if (status === 'Active') return 'bg-approved-bg text-approved-text';
  if (status === 'Idle') return 'bg-pending-bg text-pending-text';
  if (status === 'Disabled') return 'bg-sidebar text-muted-text';
  return 'bg-rejected-bg/60 text-rejected-text';
}

function formatTime(value: string | null | undefined) {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Not recorded'
    : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function formatEvent(event: ActivityEvent) {
  const details = event.details ?? {};
  if (event.event_type === 'WORKFLOW_ACTION') {
    const action = typeof details.action_type === 'string' ? details.action_type.replaceAll('_', ' ') : 'updated a request';
    const status = typeof details.new_status === 'string' ? ` · ${details.new_status.replaceAll('_', ' ')}` : '';
    return `Workflow action: ${action}${status}`;
  }
  if (event.event_type === 'SESSION_STARTED') return 'Signed in / session started';
  if (event.event_type === 'SESSION_ENDED') return 'Signed out';
  if (event.event_type === 'ACCOUNT_DISABLED') {
    return `Disabled account${typeof details.email === 'string' ? ` · ${details.email}` : ''}`;
  }
  if (event.event_type === 'ACCOUNT_ENABLED') {
    return `Enabled account${typeof details.email === 'string' ? ` · ${details.email}` : ''}`;
  }
  return event.event_type.replaceAll('_', ' ').toLowerCase();
}

// Icon and colour for each activity row, so event types are easy to scan.
function eventVisual(event: ActivityEvent): { icon: IconName; styles: string } {
  const details = event.details ?? {};
  const action = typeof details.action_type === 'string' ? details.action_type.toLowerCase() : '';
  switch (event.event_type) {
    case 'SESSION_STARTED': return { icon: 'login', styles: 'bg-clay-soft text-clay' };
    case 'SESSION_ENDED': return { icon: 'logout', styles: 'bg-sidebar text-muted-text' };
    case 'ACCOUNT_DISABLED': return { icon: 'user-x', styles: 'bg-rejected-bg text-rejected-text' };
    case 'ACCOUNT_ENABLED': return { icon: 'user-check', styles: 'bg-approved-bg text-approved-text' };
    case 'WORKFLOW_ACTION':
      if (action.includes('released') || action.includes('complete') || action.includes('approve')) {
        return { icon: 'file-check', styles: 'bg-approved-bg text-approved-text' };
      }
      if (action.includes('reject') || action.includes('decline')) return { icon: 'x', styles: 'bg-rejected-bg text-rejected-text' };
      if (action.includes('qr') || action.includes('scan')) return { icon: 'scan', styles: 'bg-review-bg text-review-text' };
      if (action.includes('location')) return { icon: 'map-pin', styles: 'bg-pending-bg text-pending-text' };
      if (action.includes('change') || action.includes('return')) return { icon: 'message', styles: 'bg-pending-bg text-pending-text' };
      return { icon: 'activity', styles: 'bg-review-bg text-review-text' };
    default:
      return { icon: 'activity', styles: 'bg-sidebar text-muted-text' };
  }
}

type DateFilterMode = 'day' | 'month' | 'year';

interface DateRange {
  from: Date;
  to: Date;
  label: string;
}

// Turns the admin's input into a [from, to) range in their local timezone.
function getDateRange(mode: DateFilterMode, value: string): DateRange | null {
  if (mode === 'day') {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    const from = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    if (Number.isNaN(from.getTime())) return null;
    const to = new Date(from.getFullYear(), from.getMonth(), from.getDate() + 1);
    return { from, to, label: from.toLocaleDateString(undefined, { dateStyle: 'long' }) };
  }
  if (mode === 'month') {
    const match = value.match(/^(\d{4})-(\d{2})$/);
    if (!match) return null;
    const from = new Date(Number(match[1]), Number(match[2]) - 1, 1);
    if (Number.isNaN(from.getTime())) return null;
    const to = new Date(from.getFullYear(), from.getMonth() + 1, 1);
    return { from, to, label: from.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) };
  }
  if (!/^\d{4}$/.test(value)) return null;
  const year = Number(value);
  if (year < 2000 || year > 2100) return null;
  return { from: new Date(year, 0, 1), to: new Date(year + 1, 0, 1), label: String(year) };
}

export default function SystemLogsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [data, setData] = useState<MonitoringData>({ officers: [], presenceSessions: [], events: [] });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const [dateFilterMode, setDateFilterMode] = useState<DateFilterMode>('day');
  const [dateFilterValue, setDateFilterValue] = useState('');
  const dateRange = useMemo(() => getDateRange(dateFilterMode, dateFilterValue), [dateFilterMode, dateFilterValue]);
  // Kept in a ref so the auto-refresh timers always use the current filter
  // without being torn down and re-created on every keystroke.
  const dateRangeRef = useRef<DateRange | null>(dateRange);
  const latestRequestRef = useRef(0);

  const fetchMonitoringData = useCallback(async (isRefresh = false) => {
    const requestId = ++latestRequestRef.current;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      const range = dateRangeRef.current;
      const query = range
        ? `?${new URLSearchParams({ from: range.from.toISOString(), to: range.to.toISOString() })}`
        : '';
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      if (!session?.access_token) throw new Error('Your administrator session has expired. Sign in again.');

      const requestLogs = (accessToken: string) => fetch(`/api/admin/system-logs${query}`, {
        cache: 'no-store',
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      let response = await requestLogs(session.access_token);
      if (response.status === 401) {
        // The cached access token can be stale (e.g. after the tab was in the
        // background and auto-refresh was paused). Refresh once and retry.
        const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
        const refreshedToken = refreshed.session?.access_token;
        if (refreshError || !refreshedToken) {
          throw new Error('Your administrator session has expired. Sign in again.');
        }
        response = await requestLogs(refreshedToken);
      }
      const result = await response.json() as MonitoringData & { error?: string };
      // Ignore responses from older requests (e.g. the filter changed mid-flight).
      if (requestId !== latestRequestRef.current) return;
      if (!response.ok) throw new Error(result.error || 'Could not load system monitoring data.');
      setData({
        officers: result.officers ?? [],
        presenceSessions: result.presenceSessions ?? [],
        events: result.events ?? [],
      });
      setNow(Date.now());
    } catch (fetchError) {
      if (requestId !== latestRequestRef.current) return;
      const message = fetchError instanceof Error ? fetchError.message : 'Could not load system monitoring data.';
      // The message is already shown in the page; warn instead of error so an
      // expected condition (like an expired session) doesn't trip the dev overlay.
      console.warn('System log refresh failed:', message);
      setError(message);
    } finally {
      if (requestId === latestRequestRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [supabase]);

  // Reload activity when the date filter changes (or is cleared).
  useEffect(() => {
    const previous = dateRangeRef.current;
    if (previous?.from.getTime() === dateRange?.from.getTime() && previous?.to.getTime() === dateRange?.to.getTime()) return;
    dateRangeRef.current = dateRange;
    void fetchMonitoringData(true);
  }, [dateRange, fetchMonitoringData]);

  const clearDateFilter = () => setDateFilterValue('');
  const changeDateFilterMode = (mode: DateFilterMode) => {
    setDateFilterMode(mode);
    setDateFilterValue('');
  };

  useEffect(() => {
    void fetchMonitoringData();
    const refreshTimer = window.setInterval(() => void fetchMonitoringData(true), 30_000);
    const updateStatusTimer = window.setInterval(() => setNow(Date.now()), 60_000);
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') void fetchMonitoringData(true);
    };
    window.addEventListener('focus', refreshWhenVisible);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      window.clearInterval(refreshTimer);
      window.clearInterval(updateStatusTimer);
      window.removeEventListener('focus', refreshWhenVisible);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [fetchMonitoringData]);

  const sessionsByOfficer = useMemo(() => {
    const grouped = new Map<string, PresenceSession[]>();
    data.presenceSessions.forEach((session) => {
      const current = grouped.get(session.user_id) ?? [];
      current.push(session);
      grouped.set(session.user_id, current);
    });
    return grouped;
  }, [data.presenceSessions]);

  const recentActivityByOfficer = useMemo(() => {
    const latest = new Map<string, string>();
    data.presenceSessions.forEach((session) => {
      const current = latest.get(session.user_id);
      if (!current || new Date(session.last_activity_at).getTime() > new Date(current).getTime()) {
        latest.set(session.user_id, session.last_activity_at);
      }
    });
    return latest;
  }, [data.presenceSessions]);

  const lastSeenByOfficer = useMemo(() => {
    const latest = new Map<string, string>();
    data.presenceSessions.forEach((session) => {
      const current = latest.get(session.user_id);
      if (!current || new Date(session.last_seen_at).getTime() > new Date(current).getTime()) {
        latest.set(session.user_id, session.last_seen_at);
      }
    });
    return latest;
  }, [data.presenceSessions]);

  return (
    <div className="space-y-7">
      <PageHero
        greet={false}
        className="mb-0"
        eyebrow="Administration"
        icon="activity"
        title="System Logs"
        description={
          <p className="max-w-3xl leading-5">
            Officer activity refreshes automatically. Active means user input within {idleThresholdHours} hours; Idle means no input for at least {idleThresholdHours} hours while a session remains present; Offline means no session was seen in the last {idleThresholdHours} hours.
          </p>
        }
        actions={
          <button
            type="button"
            onClick={() => void fetchMonitoringData(true)}
            disabled={refreshing}
            className="inline-flex h-11 shrink-0 items-center justify-center rounded-full border border-warm-border bg-card px-5 text-xs font-semibold text-warm-text transition-colors hover:bg-sidebar disabled:opacity-60"
          >
            <Icon name="refresh" size={14} className={refreshing ? 'mr-2 animate-spin motion-reduce:animate-none' : 'mr-2'} />
            {refreshing ? 'Refreshing…' : 'Refresh now'}
          </button>
        }
      />

      {error && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rejected-bg bg-rejected-bg/50 px-4 py-3 text-xs text-rejected-text">
          <span>{error}</span>
          <button type="button" onClick={() => void fetchMonitoringData(true)} className="font-semibold underline">Retry</button>
        </div>
      )}

      <section className="overflow-hidden rounded-2xl border border-warm-border bg-card">
        <div className="flex items-center justify-between border-b border-warm-border px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-warm-text">Officer presence</h2>
            <p className="mt-1 text-[11px] text-muted-text">Last seen and last interaction for each office account.</p>
          </div>
          <span className="rounded-md bg-sidebar px-2 py-1 text-[10px] font-medium text-muted-text">{data.officers.length}</span>
        </div>
        {loading ? (
          <div className="p-4"><SkeletonRows rows={2} label="Loading officer presence…" /></div>
        ) : data.officers.length === 0 ? (
          <p className="px-5 py-8 text-xs text-muted-text">No officer accounts found.</p>
        ) : (
          <div className="ui-stagger divide-y divide-warm-border">
            {data.officers.map((officer) => {
              const sessions = sessionsByOfficer.get(officer.id) ?? [];
              const status = getPresenceStatus(officer, sessions, now);
              return (
                <article key={officer.id} className="flex flex-col gap-3 px-5 py-4 transition-colors hover:bg-cream sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-avatar text-xs font-semibold text-warm-text ${status === 'Active' ? 'ui-pulse-ring' : ''}`}>
                      {(officer.full_name || officer.email || 'O').slice(0, 2).toUpperCase()}
                      <span aria-hidden="true" className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card ${status === 'Active' ? 'bg-approved-text' : status === 'Idle' ? 'bg-pending-text' : 'bg-muted-text'}`} />
                    </span>
                    <div className="min-w-0">
                    <h3 className="truncate text-sm font-medium text-warm-text">{officer.full_name || officer.email || 'Officer'}</h3>
                    <p className="mt-1 truncate text-[11px] text-muted-text">
                      {officer.email || 'No email'} · {officer.role.replaceAll('_', ' ')}
                    </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-x-5 gap-y-2">
                    <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-medium ${statusStyles(status)}`}>
                      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
                      {status}
                    </span>
                    <div className="flex flex-col gap-1 text-[11px] text-muted-text sm:text-right">
                      <span>
                        <span className="font-medium text-warm-text">Last activity</span>
                        <span className="ml-2">{formatTime(recentActivityByOfficer.get(officer.id))}</span>
                      </span>
                      <span>
                        <span className="font-medium text-warm-text">Last seen</span>
                        <span className="ml-2">{formatTime(lastSeenByOfficer.get(officer.id))}</span>
                      </span>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-2xl border border-warm-border bg-card">
        <div className="flex items-center justify-between border-b border-warm-border px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-warm-text">Recent system activity</h2>
            <p className="mt-1 text-[11px] text-muted-text">Sign-ins, account status changes, and workflow actions.</p>
          </div>
          <span className="rounded-md bg-sidebar px-2 py-1 text-[10px] font-medium text-muted-text">{data.events.length}</span>
        </div>
        <div className="flex flex-col gap-3 border-b border-warm-border px-5 py-3 sm:flex-row sm:items-center">
          <div role="group" aria-label="Filter activity by" className="inline-flex shrink-0 rounded-full border border-warm-border p-0.5">
            {(['day', 'month', 'year'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => changeDateFilterMode(mode)}
                aria-pressed={dateFilterMode === mode}
                className={`rounded-full px-3 py-1 text-[11px] font-medium capitalize transition-colors ${
                  dateFilterMode === mode ? 'bg-sidebar text-warm-text' : 'text-muted-text hover:text-warm-text'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
          <label className="flex min-w-0 flex-1 items-center gap-2">
            <span className="sr-only">
              {dateFilterMode === 'day' ? 'Activity date' : dateFilterMode === 'month' ? 'Activity month' : 'Activity year'}
            </span>
            {dateFilterMode === 'year' ? (
              <input
                type="text"
                inputMode="numeric"
                maxLength={4}
                placeholder="Type a year, e.g. 2026"
                value={dateFilterValue}
                onChange={(event) => setDateFilterValue(event.target.value.replace(/\D/g, ''))}
                className="h-9 w-full rounded-full border border-warm-border bg-card px-4 text-xs text-warm-text placeholder:text-muted-text focus:outline-none focus:ring-2 focus:ring-clay/30 sm:max-w-xs"
              />
            ) : (
              <input
                type={dateFilterMode === 'day' ? 'date' : 'month'}
                placeholder={dateFilterMode === 'day' ? 'YYYY-MM-DD' : 'YYYY-MM'}
                value={dateFilterValue}
                onChange={(event) => setDateFilterValue(event.target.value)}
                className="h-9 w-full rounded-full border border-warm-border bg-card px-4 text-xs text-warm-text placeholder:text-muted-text focus:outline-none focus:ring-2 focus:ring-clay/30 sm:max-w-xs"
              />
            )}
          </label>
          {dateFilterValue && (
            <div className="flex shrink-0 items-center gap-3 text-[11px] text-muted-text">
              <span>{dateRange ? `Showing ${dateRange.label}` : 'Enter a complete date'}</span>
              <button type="button" onClick={clearDateFilter} className="font-semibold text-warm-text underline">
                Clear
              </button>
            </div>
          )}
        </div>
        {loading ? (
          <div className="p-4"><SkeletonRows rows={3} label="Loading system activity…" /></div>
        ) : data.events.length === 0 ? (
          <p className="px-5 py-8 text-xs text-muted-text">
            {dateRange ? `No system activity was recorded for ${dateRange.label}.` : 'No system activity has been recorded yet.'}
          </p>
        ) : (
          <div className="ui-stagger divide-y divide-warm-border">
            {data.events.map((event) => {
              const visual = eventVisual(event);
              return (
              <article key={event.id} className="group flex flex-col gap-2 px-5 py-4 transition-colors hover:bg-cream sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-transform duration-200 group-hover:scale-105 ${visual.styles}`}>
                    <Icon name={visual.icon} size={17} />
                  </span>
                  <div className="min-w-0">
                  <p className="text-xs font-medium text-warm-text">{formatEvent(event)}</p>
                  <p className="mt-1 truncate text-[11px] text-muted-text">
                    {event.actor?.full_name || event.actor?.email || 'System'} · {event.actor_role.replaceAll('_', ' ')}
                    {event.submission_id ? ` · Request ${event.submission_id.slice(0, 8)}` : ''}
                  </p>
                  </div>
                </div>
                <time className="flex shrink-0 items-center gap-1.5 pl-12 text-[11px] text-muted-text sm:pl-0" dateTime={event.created_at}>
                  <Icon name="clock" size={12} />
                  {formatTime(event.created_at)}
                </time>
              </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
