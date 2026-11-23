import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL('../supabase/migrations/20261123185000_requester_email_after_completion.sql', import.meta.url),
  'utf8'
);

test('requester email is queued only for a completed SUBMISSION_CLOSED event', () => {
  const functionStart = migration.indexOf('create or replace function public.queue_workflow_notification_email()');
  const functionEnd = migration.indexOf('$$;', functionStart);
  const queueFunction = migration.slice(functionStart, functionEnd);
  const guardPosition = queueFunction.indexOf("new.event_type is distinct from 'SUBMISSION_CLOSED'");
  const insertPosition = queueFunction.indexOf('insert into public.workflow_email_outbox');

  assert.ok(functionStart >= 0);
  assert.ok(guardPosition >= 0 && guardPosition < insertPosition);
  assert.match(queueFunction, /new\.recipient_id = submission_user_id/);
  assert.match(queueFunction, /submission_status is distinct from 'completed'/);
});

test('pending requester emails for non-completed events are suppressed without deleting in-app notifications', () => {
  assert.match(migration, /email\.status in \('queued', 'processing', 'failed'\)/);
  assert.match(migration, /notification\.event_type is distinct from 'SUBMISSION_CLOSED'/);
  assert.doesNotMatch(migration, /delete from public\.workflow_notifications/i);
});
