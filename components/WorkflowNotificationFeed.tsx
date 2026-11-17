'use client';

import { useEffect, useRef, type ReactNode } from 'react';

export default function WorkflowNotificationFeed({
  children,
  busy,
  canClear,
  hasMore,
  loading,
  actionLabel = 'Delete all',
  actionConfirmation = 'Permanently delete all notifications from this feed? This removes notifications only, not submissions or workflow history.',
  onClear,
  onLoadMore,
}: {
  children: ReactNode;
  busy: boolean;
  canClear: boolean;
  hasMore: boolean;
  loading: boolean;
  actionLabel?: string;
  actionConfirmation?: string;
  onClear: () => void;
  onLoadMore: () => void | Promise<void>;
}) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadRequested = useRef(false);

  useEffect(() => {
    if (!loading) loadRequested.current = false;
  }, [loading]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore || loading || busy) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !loadRequested.current) {
          loadRequested.current = true;
          void Promise.resolve(onLoadMore()).finally(() => {
            loadRequested.current = false;
          });
        }
      },
      { rootMargin: '240px' }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [busy, hasMore, loading, onLoadMore]);

  const clearNotifications = () => {
    if (window.confirm(actionConfirmation)) {
      onClear();
    }
  };

  return (
    <>
      <div className="mb-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={clearNotifications}
          disabled={busy || !canClear}
          className="inline-flex items-center justify-center gap-2 rounded-full border border-warm-border bg-card px-4 py-2 text-[11px] font-semibold text-warm-text transition-colors hover:bg-sidebar disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? 'Updating…' : actionLabel}
        </button>
      </div>
      {children}
      <div
        ref={sentinelRef}
        className="flex min-h-12 items-center justify-center py-3 text-[11px] text-muted-text"
        aria-live="polite"
      >
        {loading ? 'Loading more notifications…' : hasMore ? 'Scroll for more' : ''}
      </div>
    </>
  );
}
