'use client';

import { useEffect, useRef } from 'react';
import type { createClient } from '@/lib/supabase/client';

type WorkflowSupabaseClient = ReturnType<typeof createClient>;

export function useWorkflowAutoRefresh(
  supabase: WorkflowSupabaseClient,
  onRefresh: () => void,
  intervalMs = 30000,
) {
  const refreshRef = useRef(onRefresh);
  refreshRef.current = onRefresh;

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    const scheduleRefresh = () => {
      if (timer !== null) return;
      timer = setTimeout(() => {
        timer = null;
        refreshRef.current();
      }, 200);
    };

    const channel = supabase
      .channel(`workflow-auto-refresh-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'workflow_submissions' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'workflow_routing_plans' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'workflow_routing_steps' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'workflow_submission_revisions' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'workflow_change_requests' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'workflow_audit_logs' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'workflow_notifications' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'workflow_document_retrievals' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'workflow_document_retrieval_events' }, scheduleRefresh)
      .subscribe();

    const pollingTimer = window.setInterval(() => refreshRef.current(), intervalMs);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') refreshRef.current();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleVisibility);

    return () => {
      if (timer !== null) clearTimeout(timer);
      window.clearInterval(pollingTimer);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleVisibility);
      void supabase.removeChannel(channel);
    };
  }, [intervalMs, supabase]);
}
