export const PRESENCE_IDLE_THRESHOLD_MS = 3 * 60 * 60 * 1000;

export interface PresenceOfficer {
  id: string;
  is_active: boolean;
}

export interface PresenceSession {
  session_id: string;
  user_id: string;
  started_at: string;
  last_seen_at: string;
  last_activity_at: string;
  ended_at: string | null;
}

export type PresenceStatus = 'Active' | 'Idle' | 'Offline' | 'Disabled';

export function getPresenceStatus(
  officer: PresenceOfficer,
  sessions: PresenceSession[],
  now: number,
): PresenceStatus {
  if (!officer.is_active) return 'Disabled';
  const recentSessions = sessions.filter((session) => {
    if (session.ended_at) return false;
    const lastSeenAge = now - new Date(session.last_seen_at).getTime();
    return Number.isFinite(lastSeenAge) && lastSeenAge <= PRESENCE_IDLE_THRESHOLD_MS;
  });
  if (recentSessions.some((session) => {
    const activityAge = now - new Date(session.last_activity_at).getTime();
    return Number.isFinite(activityAge) && activityAge < PRESENCE_IDLE_THRESHOLD_MS;
  })) {
    return 'Active';
  }
  return recentSessions.length > 0 ? 'Idle' : 'Offline';
}
