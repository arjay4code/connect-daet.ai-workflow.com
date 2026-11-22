'use client';

import { useCallback, useEffect, useRef } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { createClient } from '@/lib/supabase/client';

type PresenceEvent = 'session_started' | 'activity' | 'heartbeat' | 'session_ended';

const SESSION_STORAGE_KEY = 'workflow-presence-session-id';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEARTBEAT_INTERVAL_MS = 60_000;
const ACTIVITY_THROTTLE_MS = 60_000;
const ACTIVITY_REQUEST_TIMEOUT_MS = 15_000;

export function useWorkflowActivityPresence(
  supabase: ReturnType<typeof createClient>,
  session: Session | null | undefined,
) {
  const sessionIdRef = useRef<string | null>(null);
  const sessionStorageKeyRef = useRef<string | null>(null);
  const authSessionRef = useRef<Session | null>(null);
  const lastActivitySentAtRef = useRef(0);
  const lastErrorLoggedAtRef = useRef(0);

  const logPresenceWarning = useCallback((context: string, error: unknown) => {
    const now = Date.now();
    if (now - lastErrorLoggedAtRef.current < 5 * 60_000) return;
    const message = error instanceof Error ? error.message : String(error);
    console.warn(context, message);
    lastErrorLoggedAtRef.current = now;
  }, []);

  const sendEvent = useCallback(async (event: PresenceEvent) => {
    const sessionId = sessionIdRef.current;
    if (!sessionId) return;

    try {
      const currentSession = authSessionRef.current;
      if (!currentSession?.access_token) return;

      const postEvent = (accessToken: string) => fetch('/api/workflow/activity', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ sessionId, event }),
        signal: AbortSignal.timeout(ACTIVITY_REQUEST_TIMEOUT_MS),
      });

      let response = await postEvent(currentSession.access_token);
      if (response.status === 401) {
        const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
        if (refreshError) throw refreshError;
        authSessionRef.current = refreshed.session;
        const refreshedToken = refreshed.session?.access_token;
        if (!refreshedToken) {
          logPresenceWarning(
            'Workflow activity is paused because the sign-in session has expired:',
            new Error('Sign in again to resume activity monitoring.'),
          );
          return;
        }
        response = await postEvent(refreshedToken);
      }

      if (!response.ok) {
        const result = await response.json() as { error?: string };
        if (response.status === 401) {
          logPresenceWarning('Workflow activity is paused because the session is no longer valid:', result.error);
          return;
        }
        throw new Error(result.error || `Activity endpoint returned ${response.status}.`);
      }
    } catch (error) {
      const errorName = typeof error === 'object' && error !== null && 'name' in error
        ? error.name
        : '';
      logPresenceWarning(
        errorName === 'TimeoutError'
          ? 'Workflow activity request timed out; presence may be delayed:'
          : 'Could not record workflow activity; monitoring will retry:',
        error,
      );
    }
  }, [logPresenceWarning, supabase]);

  useEffect(() => {
    authSessionRef.current = session ?? null;
  }, [session]);

  useEffect(() => {
    if (session === undefined) return;

    let disposed = false;
    let heartbeatTimer: number | null = null;
    let listenersAttached = false;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      authSessionRef.current = nextSession;
    });
    const sendHeartbeat = () => {
      if (document.visibilityState === 'visible') void sendEvent('heartbeat');
    };
    const recordActivity = () => {
      if (document.visibilityState !== 'visible') return;
      const now = Date.now();
      if (now - lastActivitySentAtRef.current < ACTIVITY_THROTTLE_MS) return;
      lastActivitySentAtRef.current = now;
      void sendEvent('activity');
    };

    const initializePresence = async () => {
      if (disposed || !session) return;

      const storageKey = `${SESSION_STORAGE_KEY}:${session.user.id}`;
      sessionStorageKeyRef.current = storageKey;
      let sessionId: string;
      try {
        const storedSessionId = window.sessionStorage.getItem(storageKey);
        sessionId = storedSessionId && UUID_PATTERN.test(storedSessionId)
          ? storedSessionId
          : window.crypto.randomUUID();
        window.sessionStorage.setItem(storageKey, sessionId);
      } catch (storageError) {
        console.warn('Browser session storage is unavailable; activity monitoring will use a temporary session:', storageError);
        sessionId = window.crypto.randomUUID();
      }
      sessionIdRef.current = sessionId;

      await sendEvent('session_started');
      if (disposed) return;

      heartbeatTimer = window.setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
      document.addEventListener('visibilitychange', sendHeartbeat);
      document.addEventListener('pointerdown', recordActivity, { passive: true });
      document.addEventListener('keydown', recordActivity);
      document.addEventListener('touchstart', recordActivity, { passive: true });
      document.addEventListener('scroll', recordActivity, { passive: true });
      listenersAttached = true;
    };

    void initializePresence();

    return () => {
      disposed = true;
      if (heartbeatTimer !== null) window.clearInterval(heartbeatTimer);
      subscription.unsubscribe();
      if (listenersAttached) {
        document.removeEventListener('visibilitychange', sendHeartbeat);
        document.removeEventListener('pointerdown', recordActivity);
        document.removeEventListener('keydown', recordActivity);
        document.removeEventListener('touchstart', recordActivity);
        document.removeEventListener('scroll', recordActivity);
      }
    };
  }, [logPresenceWarning, sendEvent, session, supabase]);

  return useCallback(async () => {
    await sendEvent('session_ended');
    sessionIdRef.current = null;
    if (sessionStorageKeyRef.current) {
      try {
        window.sessionStorage.removeItem(sessionStorageKeyRef.current);
      } catch (storageError) {
        console.warn('Could not clear the workflow presence session from browser storage:', storageError);
      }
      sessionStorageKeyRef.current = null;
    }
  }, [sendEvent]);
}
