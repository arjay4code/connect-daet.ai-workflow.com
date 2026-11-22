'use client';

import { useEffect, useRef } from 'react';

export function useWorkflowPolling(
  onRefresh: () => void | Promise<void>,
  intervalMs = 30_000,
) {
  const refreshRef = useRef(onRefresh);
  const refreshInFlightRef = useRef(false);
  refreshRef.current = onRefresh;

  useEffect(() => {
    let active = true;
    const refresh = () => {
      if (!active || refreshInFlightRef.current || document.visibilityState !== 'visible') return;
      refreshInFlightRef.current = true;
      void Promise.resolve(refreshRef.current())
        .catch((error: unknown) => {
          console.error('Automatic workflow data refresh failed:', error);
        })
        .finally(() => {
          refreshInFlightRef.current = false;
        });
    };

    const timer = window.setInterval(refresh, intervalMs);
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);

    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [intervalMs]);
}
