'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  getPresenceStatus,
  PRESENCE_IDLE_THRESHOLD_MS,
  type PresenceSession,
  type PresenceStatus,
} from '@/lib/workflow/presence';

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

export default function SystemLogsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [data, setData] = useState<MonitoringData>({ officers: [], presenceSessions: [], events: [] });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [now, setNow] = useState(() => Date.now());

  const fetchMonitoringData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      if (!session?.access_token) throw new Error('Your administrator session has expired. Sign in again.');

      const response = await fetch('/api/admin/system-logs', {
        cache: 'no-store',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const result = await response.json() as MonitoringData & { error?: string };
      if (!response.ok) throw new Error(result.error || 'Could not load system monitoring data.');
      setData({
        officers: result.officers ?? [],
        presenceSessions: result.presenceSessions ?? [],
        events: result.events ?? [],
      });
      setNow(Date.now());
    } catch (fetchError) {
      const message = fetchError instanceof Error ? fetchError.message : 'Could not load system monitoring data.';
      console.error('System log refresh failed:', message);
      setError(message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [supabase]);

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
      <section className="flex flex-col gap-4 rounded-2xl border border-warm-border bg-card p-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-clay">Administration</p>
          <h1 className="mt-2 text-2xl font-semibold text-warm-text">System Logs</h1>
          <p className="mt-2 max-w-3xl text-xs leading-5 text-muted-text">
            Officer activity refreshes automatically.                         Active means user input within {idleThresholdHours} hours; Idle means no input for at least {idleThresholdHours} hours while a session remains present; Offline means no session was seen in the last {idleThresholdHours} hours.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void fetchMonitoringData(true)}
          disabled={refreshing}
          className="inline-flex h-11 shrink-0 items-center justify-center rounded-full border border-warm-border px-5 text-xs font-semibold text-warm-text transition-colors hover:bg-sidebar disabled:opacity-60"
        >
          {refreshing ? 'Refreshing…' : 'Refresh now'}
        </button>
      </section>

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
          <p className="px-5 py-8 text-xs text-muted-text">Loading officer presence…</p>
        ) : data.officers.length === 0 ? (
          <p className="px-5 py-8 text-xs text-muted-text">No officer accounts found.</p>
        ) : (
          <div className="divide-y divide-warm-border">
            {data.officers.map((officer) => {
              const sessions = sessionsByOfficer.get(officer.id) ?? [];
              const status = getPresenceStatus(officer, sessions, now);
              return (
                <article key={officer.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-medium text-warm-text">{officer.full_name || officer.email || 'Officer'}</h3>
                    <p className="mt-1 truncate text-[11px] text-muted-text">
                      {officer.email || 'No email'} · {officer.role.replaceAll('_', ' ')}
                    </p>
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
        {loading ? (
          <p className="px-5 py-8 text-xs text-muted-text">Loading system activity…</p>
        ) : data.events.length === 0 ? (
          <p className="px-5 py-8 text-xs text-muted-text">No system activity has been recorded yet.</p>
        ) : (
          <div className="divide-y divide-warm-border">
            {data.events.map((event) => (
              <article key={event.id} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-warm-text">{formatEvent(event)}</p>
                  <p className="mt-1 truncate text-[11px] text-muted-text">
                    {event.actor?.full_name || event.actor?.email || 'System'} · {event.actor_role.replaceAll('_', ' ')}
                    {event.submission_id ? ` · Request ${event.submission_id.slice(0, 8)}` : ''}
                  </p>
                </div>
                <time className="shrink-0 text-[11px] text-muted-text" dateTime={event.created_at}>
                  {formatTime(event.created_at)}
                </time>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
