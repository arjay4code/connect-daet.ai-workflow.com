import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const adminPage = await readFile(
  new URL('../app/(dashboard)/workflow/admin/submissions/[id]/page.tsx', import.meta.url),
  'utf8',
);
const officeDetail = await readFile(
  new URL('../components/OfficeSubmissionDetail.tsx', import.meta.url),
  'utf8',
);
const messaging = await readFile(
  new URL('../components/DocumentMessaging.tsx', import.meta.url),
  'utf8',
);

test('admin submission details use the shared office layout in read-only mode', () => {
  assert.match(adminPage, /<OfficeSubmissionDetail readOnly/);
  assert.match(officeDetail, /const officeReview = readOnly \|\|/);
  assert.match(officeDetail, /if \(readOnly\) throw new Error\('This submission view is read-only\.'\)/);
  assert.match(officeDetail, /if \(readOnly \|\| !sub \|\| !isOfficeRole\(role\)/);
  assert.match(officeDetail, /showWorkflowActions: !readOnly/);
  assert.match(officeDetail, /Read-only view\. Administrators can review this submission/);
});

test('read-only message history cannot send messages or mark them read', () => {
  assert.match(messaging, /readOnly\?: boolean/);
  assert.match(messaging, /if \(readOnly\) return;\s+const unreadMessages/);
  assert.match(messaging, /\{!readOnly && <form/);
  assert.match(messaging, /const canSendCurrentConversation = !readOnly/);
});
