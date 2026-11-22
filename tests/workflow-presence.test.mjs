import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getPresenceStatus,
  PRESENCE_IDLE_THRESHOLD_MS,
} from '../lib/workflow/presence.ts';

const now = Date.parse('2026-01-01T12:00:00.000Z');
const officer = { id: 'officer-1', is_active: true };

function session({ lastSeenAge = 0, lastActivityAge = 0, ended = false } = {}) {
  return {
    session_id: 'session-1',
    user_id: officer.id,
    started_at: new Date(now - PRESENCE_IDLE_THRESHOLD_MS).toISOString(),
    last_seen_at: new Date(now - lastSeenAge).toISOString(),
    last_activity_at: new Date(now - lastActivityAge).toISOString(),
    ended_at: ended ? new Date(now).toISOString() : null,
  };
}

test('officer presence uses the configured three-hour activity threshold', () => {
  assert.equal(PRESENCE_IDLE_THRESHOLD_MS, 3 * 60 * 60 * 1000);
  assert.equal(
    getPresenceStatus(officer, [session({ lastActivityAge: PRESENCE_IDLE_THRESHOLD_MS - 1 })], now),
    'Active',
  );
  assert.equal(
    getPresenceStatus(officer, [session({ lastActivityAge: PRESENCE_IDLE_THRESHOLD_MS })], now),
    'Idle',
  );
  assert.equal(
    getPresenceStatus(officer, [session({ lastSeenAge: PRESENCE_IDLE_THRESHOLD_MS + 1 })], now),
    'Offline',
  );
});

test('disabled and explicitly ended officer sessions are not reported as active', () => {
  assert.equal(getPresenceStatus({ ...officer, is_active: false }, [session()], now), 'Disabled');
  assert.equal(getPresenceStatus(officer, [session({ ended: true })], now), 'Offline');
});
