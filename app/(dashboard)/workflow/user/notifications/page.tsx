'use client';
import { logClientError } from '@/lib/clientLogger';

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import WorkflowNotificationFeed from '@/components/WorkflowNotificationFeed';
import SwipeDismissNotification from '@/components/SwipeDismissNotification';
import PageHero from '@/components/ui/PageHero';
import Icon from '@/components/ui/Icon';
import SkeletonRows from '@/components/ui/SkeletonRows';

// ─── Styles & Fonts (synced with dashboard) ──────────────────────────────────
const fonts = {
  serif: "font-serif",
  mono: "font-sans text-xs",
};

// "5 min ago", "2 hours ago", "3 days ago"
const timeAgo = (dateString: string) => {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(dateString).getTime()) / 1000));
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} ${days === 1 ? 'day' : 'days'} ago`;
  return new Date(dateString).toLocaleDateString();
};

const getStatusConfig = (status: string) => {
  const currentStatus = (status || '').toLowerCase();
  if (currentStatus === 'pending' || currentStatus === 'pending_approver') {
    return { label: 'Under review', styles: 'bg-pending-bg text-pending-text' };
  }
  if (currentStatus === 'pending_admin') {
    return { label: 'Under review', styles: 'bg-review-bg text-review-text' };
  }
  if (currentStatus === 'completed') {
    return { label: 'Completed', styles: 'bg-approved-bg text-approved-text' };
  }
  if (currentStatus.includes('approved')) {
    return { label: 'Approved', styles: 'bg-approved-bg text-approved-text' };
  }
  if (currentStatus.includes('declined') || currentStatus.includes('rejected')) {
    return { label: 'Returned for correction', styles: 'bg-rejected-bg text-rejected-text' };
  }
  return {
    label: currentStatus.replaceAll('_', ' ') || 'Unknown',
    styles: 'bg-sidebar text-muted-text',
  };
};

const PAGE_SIZE = 30;

const getErrorMessage = (error: unknown, fallback: string) => {
  if (typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return fallback;
};

interface NotificationCursor {
  createdAt: string;
  id: string;
}

interface UserNotification {
  id: string;
  submission_id: string;
  notification_id: string;
  notification_title?: string;
  notification_message?: string;
  notification_status?: string;
  status?: string;
  file_name?: string | null;
  tracking_number?: string | null;
  requester_email?: string | null;
  description?: string | null;
  updated_at: string;
  is_unread: boolean;
}

const getNotificationStatus = (eventType: string, currentStatus: string) => {
  switch (eventType) {
    case 'SUBMITTED':
      return 'pending';
    case 'VERIFICATION_PASSED':
      return 'pending_admin';
    case 'RETURNED_FOR_CORRECTION':
      return 'declined_by_approver';
    case 'FINAL_APPROVAL':
      return 'approved';
    case 'FINAL_REJECTION':
      return 'declined_by_admin';
    case 'WORKFLOW_COMPLETED':
      return 'completed';
    default:
      return currentStatus;
  }
};

export default function NotificationsPage() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const fetchInFlight = useRef(false);
  const [notifications, setNotifications] = useState<UserNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [cursor, setCursor] = useState<NotificationCursor | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchNotifications = useCallback(async (
    startAfter: NotificationCursor | null,
    append = false,
    updateCursor = true
  ) => {
    if (fetchInFlight.current) return;
    fetchInFlight.current = true;
    setLoading(true);
    setErrorMessage(null);
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!user) {
        setNotifications([]);
        setHasMore(false);
        return;
      }

      let query = supabase
        .from('workflow_notifications')
        .select('*, workflow_submissions(*, profiles:user_id(email))')
        .eq('recipient_id', user.id)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(PAGE_SIZE + 1);
      if (startAfter) {
        query = query.or(
          `created_at.lt.${startAfter.createdAt},and(created_at.eq.${startAfter.createdAt},id.lt.${startAfter.id})`
        );
      }
      const { data, error } = await query;
      if (error) throw error;

      const rows = data || [];
      const pageRows = rows.slice(0, PAGE_SIZE);
      const pageNotifications: UserNotification[] = pageRows
        .map((notification) => ({
            ...notification.workflow_submissions,
            id: notification.submission_id,
            submission_id: notification.submission_id,
            notification_id: notification.id,
            notification_title: notification.title,
            notification_message: notification.message,
            requester_email: notification.workflow_submissions?.profiles?.email,
            notification_status: getNotificationStatus(
              notification.event_type,
              notification.workflow_submissions?.status
            ),
            updated_at: notification.created_at,
            is_unread: !notification.read_at,
          }));
      setNotifications((current) => {
        const merged = new Map<string, UserNotification>(
          (append ? current : []).map((notification) => [notification.notification_id, notification])
        );
        pageNotifications.forEach((notification) => merged.set(notification.notification_id, notification));
        return Array.from(merged.values()).sort(
          (first, second) => Date.parse(second.updated_at) - Date.parse(first.updated_at)
        );
      });
      if (updateCursor) {
        const lastRow = pageRows.at(-1);
        setCursor(lastRow ? { createdAt: lastRow.created_at, id: lastRow.id } : startAfter);
        setHasMore(rows.length > PAGE_SIZE);
      }
    } catch (error) {
      const message = getErrorMessage(error, 'Could not load notifications.');
      logClientError('Failed to load requestee notifications:', message);
      setErrorMessage(message);
      if (!append) setNotifications([]);
      setHasMore(false);
    } finally {
      fetchInFlight.current = false;
      setLoading(false);
    }
  }, [supabase]);

  const deleteNotification = async (notificationId: string) => {
    if (actionBusy || !window.confirm('Delete this notification permanently? The submission and workflow history will not be deleted.')) return;
    setActionBusy(true);
    setErrorMessage(null);
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw userError || new Error('Sign in before deleting notifications.');
      const { data, error } = await supabase
        .from('workflow_notifications')
        .delete()
        .eq('id', notificationId)
        .eq('recipient_id', user.id)
        .select('id')
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('Notification not found or you do not have permission to delete it.');
      setNotifications((current) => current.filter((notification) => notification.notification_id !== notificationId));
      window.dispatchEvent(new Event('workflow-notifications-changed'));
    } catch (error) {
      setErrorMessage(getErrorMessage(error, 'Could not delete the notification.'));
    } finally {
      setActionBusy(false);
    }
  };

  const clearNotifications = async () => {
    setActionBusy(true);
    setErrorMessage(null);
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw userError || new Error('Sign in before deleting notifications.');
      const { error } = await supabase
        .from('workflow_notifications')
        .delete()
        .eq('recipient_id', user.id);
      if (error) throw error;
      setNotifications([]);
      setCursor(null);
      setHasMore(false);
      window.dispatchEvent(new Event('workflow-notifications-changed'));
    } catch (error) {
      setErrorMessage(getErrorMessage(error, 'Could not delete notifications.'));
    } finally {
      setActionBusy(false);
    }
  };

  const openNotification = async (
    event: MouseEvent<HTMLAnchorElement>,
    notification: UserNotification
  ) => {
    event.preventDefault();
    try {
      if (notification.is_unread) {
        setErrorMessage(null);
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (userError || !user) throw userError || new Error('Sign in before opening notifications.');
        const { error } = await supabase
          .from('workflow_notifications')
          .update({ read_at: new Date().toISOString() })
          .eq('id', notification.notification_id)
          .eq('recipient_id', user.id);
        if (error) throw error;
        setNotifications((current) => current.map((item) =>
          item.notification_id === notification.notification_id ? { ...item, is_unread: false } : item
        ));
        window.dispatchEvent(new Event('workflow-notifications-changed'));
      }
      router.push(`/workflow/user/file_registry/${notification.id}`);
    } catch (error) {
      setErrorMessage(getErrorMessage(error, 'Could not open this notification.'));
    }
  };

  useEffect(() => {
    void fetchNotifications(null);

    const channel = supabase
      .channel('schema-db-changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'workflow_notifications',
        },
        () => void fetchNotifications(null, true, false)
      )
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [fetchNotifications, supabase]);

  // Split into "Today" and "Earlier" groups (list is already newest first)
  const todayString = new Date().toDateString();
  const groups = [
    { title: 'Today', items: notifications.filter(n => new Date(n.updated_at).toDateString() === todayString) },
    { title: 'Earlier', items: notifications.filter(n => new Date(n.updated_at).toDateString() !== todayString) },
  ].filter(g => g.items.length > 0);

  return (
    <div className="w-full">
      <div>
        <PageHero
          greet={false}
          eyebrow="Live updates"
          icon="bell"
          title="Notifications"
          description="Updates on your requests appear here as offices act on them."
        />

        <WorkflowNotificationFeed
          busy={actionBusy || loading}
          canClear={notifications.length > 0}
          hasMore={hasMore}
          loading={loading}
          actionLabel="Delete all"
          actionConfirmation="Permanently delete all your notifications? This removes notification records only, not submissions or workflow history."
          onClear={clearNotifications}
          onLoadMore={() => fetchNotifications(cursor, true)}
        >
        {errorMessage && (
          <p role="alert" className="mb-4 rounded-xl border border-rejected-bg bg-rejected-bg/40 px-4 py-3 text-xs text-rejected-text">
            {errorMessage}
          </p>
        )}

        {loading && notifications.length === 0 ? (
          <SkeletonRows rows={4} label="Loading notifications…" />
        ) : notifications.length === 0 ? (
          <div className="ui-fade-up rounded-2xl border border-warm-border bg-card py-20 text-center">
            <div className="ui-float mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-clay-soft text-clay"><Icon name="bell" size={24} /></div>
            <p className={`${fonts.serif} text-2xl text-warm-text`}>No notifications yet</p>
            <p className="mt-2 text-xs text-muted-text">Updates on your submissions will appear here.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {groups.map(group => (
              <section key={group.title} className="ui-fade-up">
                <h2 className="mb-2 flex items-center gap-2 px-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-text"><Icon name="calendar" size={13} />{group.title}</h2>

                <div role="list" className="space-y-2">
                  {group.items.map((note) => {
                    const status = getStatusConfig(note.notification_status || note.status || '');

                    return (
                      <SwipeDismissNotification
                        key={note.notification_id}
                        onDismiss={() => void deleteNotification(note.notification_id)}
                        label={`Delete notification for ${note.file_name || 'submission'}`}
                        actionText="Delete"
                        busy={actionBusy}
                      >
                        <Link
                          href={`/workflow/user/file_registry/${note.id}`}
                          onClick={(event) => void openNotification(event, note)}
                          className="group flex flex-col gap-5 border border-warm-border bg-card px-5 py-5 pr-14 transition-colors hover:border-clay-border focus-visible:outline focus-visible:outline-2 focus-visible:outline-clay sm:flex-row sm:items-center sm:justify-between max-md:gap-3 max-md:px-3.5 max-md:pr-14 max-md:py-3.5"
                        >
                          <div className="flex min-w-0 flex-1 items-center gap-4">
                            <div className="relative flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-sidebar text-muted-text">
                              <span className="text-lg leading-4" aria-hidden="true">▤</span>
                              <span className="mt-1 text-[8px] font-semibold uppercase">
                                {note.file_name?.split('.').at(-1)?.slice(0, 3) || 'File'}
                              </span>
                              {note.is_unread && (
                                <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-card bg-clay" aria-label="Unread" />
                              )}
                            </div>

                            <div className="min-w-0 flex-1">
                              <div className="mb-1.5 flex flex-wrap items-center gap-2">
                                {note.is_unread && (
                                  <span className="rounded-md bg-clay-soft px-2 py-1 text-[10px] font-medium text-clay">Unread</span>
                                )}
                                <span className="text-[11px] font-medium text-warm-text">
                                  {note.notification_title || 'Submission update'}
                                </span>
                              </div>
                              <h3 className="truncate text-sm font-semibold text-warm-text group-hover:text-clay">
                                {note.file_name || 'Untitled file'}
                              </h3>
                              <div className="mt-1.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-text">
                                <span>{timeAgo(note.updated_at)}</span>
                                {note.tracking_number && (
                                  <>
                                    <span aria-hidden="true">·</span>
                                    <span>Tracking {note.tracking_number}</span>
                                  </>
                                )}
                                {note.notification_message && (
                                  <>
                                    <span aria-hidden="true">·</span>
                                    <span className="truncate">{note.notification_message}</span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-2 sm:justify-end max-md:w-full max-md:flex-col max-md:items-stretch">
                            <span className={`inline-flex items-center gap-2 self-start whitespace-nowrap rounded-full px-3 py-1.5 text-[11px] font-medium ${status.styles}`}>
                              <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
                              {status.label}
                            </span>
                            <span className="inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-full bg-clay px-5 text-xs font-semibold text-white transition-colors group-hover:bg-warm-text max-md:h-11 max-md:w-full">
                              View details <span aria-hidden="true">→</span>
                            </span>
                          </div>
                        </Link>
                      </SwipeDismissNotification>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}

        {!hasMore && notifications.length > 0 && !loading && (
          <footer className="mt-8 border-t border-warm-border pt-6">
            <p className="text-center text-[11px] text-muted-text">You&apos;re all caught up.</p>
          </footer>
        )}
        </WorkflowNotificationFeed>
      </div>
    </div>
  );
}