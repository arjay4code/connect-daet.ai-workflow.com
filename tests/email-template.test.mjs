import assert from 'node:assert/strict';
import test from 'node:test';
import { renderWorkflowNotificationEmail } from '../lib/email/templates.ts';

test('notification emails escape untrusted content in HTML and include a text version', () => {
  const email = renderWorkflowNotificationEmail({
    actionUrl: '/workflow/user/file_registry/submission-id',
    appUrl: 'https://docuflow.example',
    body: '<script>alert("x")</script>\nPlease review.',
    documentReference: 'DOC-1 & DOC-2',
    eventType: 'SUBMISSION_CLOSED',
    recipientName: 'A <User>',
    routePipeline: {
      steps: [
        {
          key: 'submitted',
          title: 'Submitted',
          subtitle: 'To Daet Tourism Office',
          state: 'complete',
          detail: 'Submitted',
        },
        {
          key: 'final-completed',
          title: 'Completed',
          subtitle: 'Daet Tourism Office',
          state: 'complete',
          detail: 'Processing finished',
        },
      ],
      whereabouts: 'Completed by Daet Tourism Office',
      whereaboutsState: 'complete',
    },
    subject: 'Document update',
    title: 'Document updated',
  });

  assert.match(email.html, /&lt;script&gt;/);
  assert.doesNotMatch(email.html, /<script>/);
  assert.match(email.html, /A &lt;User&gt;/);
  assert.match(email.html, /DOC-1 &amp; DOC-2/);
  assert.match(email.html, /Connect-Daet<span/);
  assert.match(email.html, /src="https:\/\/docuflow\.example\/daet-logo\.png"/);
  assert.match(email.html, /Municipality of Daet seal/);
  assert.match(email.html, /Your submission has been completed and processed successfully\./);
  assert.match(email.html, /Request route/);
  assert.match(email.html, /Current status:<\/strong> Completed by Daet Tourism Office/);
  assert.match(email.text, /Request route:/);
  assert.match(email.text, /2\. Completed — Daet Tourism Office · Processing finished \(Done\)/);
  assert.match(email.html, /Open document/);
  assert.match(email.text, /Open document:/);
  assert.match(email.text, /https:\/\/docuflow\.example\/workflow\/user\/file_registry\/submission-id/);
});

test('non-completion emails use neutral update copy', () => {
  const email = renderWorkflowNotificationEmail({
    actionUrl: '/workflow/user/file_registry/submission-id',
    appUrl: 'https://connect-daet.example',
    body: 'A document has an update.',
    documentReference: null,
    eventType: 'CHANGES_REQUESTED',
    recipientName: null,
    subject: 'Changes requested',
    title: 'Changes requested for your submission',
  });

  assert.match(email.html, /There is an update to your document request\./);
  assert.doesNotMatch(email.html, /Your submission has been completed and processed successfully\./);
});

test('notification email action links cannot leave the application origin', () => {
  assert.throws(
    () => renderWorkflowNotificationEmail({
      actionUrl: 'https://attacker.example/',
      appUrl: 'https://docuflow.example',
      body: 'Review the document.',
      documentReference: null,
      recipientName: null,
      subject: 'Document update',
      title: 'Document updated',
    }),
    /must stay on the application origin/
  );
});
