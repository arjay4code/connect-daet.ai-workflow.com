'use client';

import { useEffect, useRef } from 'react';
import type { createClient } from '@/lib/supabase/client';

type WorkflowSupabaseClient = ReturnType<typeof createClient>;

const isRoutingStepPayload = (value: unknown): value is { routing_plan_id: string } =>
  typeof value === 'object'
  && value !== null
  && 'routing_plan_id' in value
  && typeof value.routing_plan_id === 'string';

export function createCoalescedRefresh(refresh: () => void, delay = 200) {
  let timer: ReturnType<typeof setTimeout> | null = null;

  return {
    schedule() {
      if (timer !== null) return;
      timer = setTimeout(() => {
        timer = null;
        refresh();
      }, delay);
    },
    cancel() {
      if (timer !== null) clearTimeout(timer);
      timer = null;
    },
  };
}

export function useSubmissionDetailRealtime(
  supabase: WorkflowSupabaseClient,
  submissionId: string | null,
  routePlanIds: string[],
  onRefresh: () => void,
) {
  const routePlanIdsRef = useRef(new Set(routePlanIds));
  routePlanIdsRef.current = new Set(routePlanIds);
  const routePlanIdsKey = routePlanIds.join(',');

  useEffect(() => {
    if (!submissionId) return;

    const refresh = createCoalescedRefresh(onRefresh);
    const channel = supabase
      .channel(`workflow-submission-detail-${submissionId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'workflow_submissions',
        filter: `id=eq.${submissionId}`,
      }, refresh.schedule)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'workflow_submission_revisions',
        filter: `submission_id=eq.${submissionId}`,
      }, refresh.schedule)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'workflow_change_requests',
        filter: `submission_id=eq.${submissionId}`,
      }, refresh.schedule)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'workflow_routing_plans',
        filter: `submission_id=eq.${submissionId}`,
      }, refresh.schedule)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'workflow_routing_steps',
      }, (payload) => {
        const row: unknown = Object.keys(payload.new).length > 0
          ? payload.new
          : payload.old;
        if (isRoutingStepPayload(row) && routePlanIdsRef.current.has(row.routing_plan_id)) {
          refresh.schedule();
        }
      })
      .subscribe();

    const pollingTimer = window.setInterval(onRefresh, 30000);
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') onRefresh();
    };
    document.addEventListener('visibilitychange', refreshWhenVisible);
    window.addEventListener('focus', refreshWhenVisible);

    return () => {
      refresh.cancel();
      window.clearInterval(pollingTimer);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
      window.removeEventListener('focus', refreshWhenVisible);
      void supabase.removeChannel(channel);
    };
  }, [onRefresh, routePlanIdsKey, submissionId, supabase]);
}
