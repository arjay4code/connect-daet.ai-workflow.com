import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const timeline = await readFile(
  new URL('../components/WorkflowActivityTimeline.tsx', import.meta.url),
  'utf8',
);
const submitterPage = await readFile(
  new URL('../app/(dashboard)/workflow/user/file_registry/[id]/page.tsx', import.meta.url),
  'utf8',
);

test('activity pane shows the five latest key updates in chronological order, top to bottom', () => {
  assert.match(timeline, /const RECENT_EVENT_LIMIT = 5/);
  assert.match(timeline, /a\.createdAt\.localeCompare\(b\.createdAt\)/);
  assert.match(timeline, /keyEvents\.slice\(-RECENT_EVENT_LIMIT\)/);
  assert.match(timeline, /Recent updates/);
  assert.match(timeline, /Showing the \$\{recentEvents\.length\} most recent of \$\{keyEvents\.length\} updates/);
});

test('expanded activity history clearly identifies itself as all updates', () => {
  assert.match(timeline, /View all updates \(\{sortedEvents\.length\}\)/);
  assert.match(timeline, /sortedEvents\.map\(\(event\) => <ActivityEvent/);
});

test('submitter activity hides audit comments while office and admin timelines retain them', () => {
  assert.match(submitterPage, /<WorkflowActivityTimeline[\s\S]*?showComments=\{false\}/);
  assert.match(timeline, /showComments = true/);
  assert.match(timeline, /showComments && event\.comments/);
});
