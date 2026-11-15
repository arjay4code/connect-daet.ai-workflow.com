import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const page = await readFile(
  new URL('../app/(dashboard)/workflow/user/file_registry/[id]/page.tsx', import.meta.url),
  'utf8',
);
const panel = await readFile(
  new URL('../components/WorkflowStatusPanel.tsx', import.meta.url),
  'utf8',
);
const officeDetail = await readFile(
  new URL('../components/OfficeSubmissionDetail.tsx', import.meta.url),
  'utf8',
);
const adminDetail = await readFile(
  new URL('../app/(dashboard)/workflow/admin/submissions/[id]/page.tsx', import.meta.url),
  'utf8',
);
const detailMigration = await readFile(
  new URL(
    '../supabase/migrations/20261114090000_add_workflow_submission_revision_history.sql',
    import.meta.url,
  ),
  'utf8',
);

test('submitter detail loads route history through the shared detail RPC and renders workflow status', () => {
  assert.match(page, /loadWorkflowSubmissionDetail\(supabase, id\)/);
  assert.doesNotMatch(page, /\.from\('workflow_routing_plans'\)|\.from\('workflow_routing_steps'\)/);
  assert.match(page, /steps=\{routeSteps\}/);
  assert.match(page, /<WorkflowStatusPanel/);
  assert.match(panel, /Office handling your request/);
  assert.match(panel, /Current office activity/);
  assert.match(panel, /Office updates and decisions/);
  assert.match(panel, /Final decision: Approved/);
  assert.match(panel, /Final decision: Rejected/);
  assert.ok(page.indexOf('id={`document-preview-${sub.id}`}') < page.indexOf('<WorkflowStatusPanel'));
  assert.ok(page.indexOf('<FilePreview file={sub} />') < page.indexOf('Pickup QR code'));
  assert.ok(page.indexOf('Pickup QR code') < page.indexOf('<WorkflowStatusPanel'));
  assert.ok(page.indexOf('<WorkflowStatusPanel') < page.indexOf('<DocumentMessaging'));
  assert.match(page, /\{\(isChangesRequested \|\| isRedirectable \|\| isCompleted\) && \(\s*<div className="order-2/);
  assert.match(page, /\{\(isChangesRequested \|\| isRedirectable\) && \(\s*<section className="order-3/);
  assert.match(page, /data\.status === 'completed' \|\| data\.status === 'approved'/);
  const mainPreviewButton = page.slice(
    page.indexOf('onClick={() => setPreviewOpen((open) => !open)}'),
    page.indexOf('</button>', page.indexOf('onClick={() => setPreviewOpen((open) => !open)}')),
  );
  assert.match(mainPreviewButton, /aria-pressed=\{previewOpen\}/);
  assert.match(mainPreviewButton, /className="flex min-w-0 flex-1 items-center justify-between gap-4 text-left"/);
  assert.match(mainPreviewButton, /className=\{`grid h-9 w-9[\s\S]*?border-clay bg-clay-soft text-clay/);
  assert.doesNotMatch(page, /Review update|Official feedback/);
});

test('office and admin preview controls highlight only their toggles while open', () => {
  const officePreviewButton = officeDetail.slice(
    officeDetail.indexOf('onClick={() => setPreviewOpen((open) => !open)}'),
    officeDetail.indexOf('</button>', officeDetail.indexOf('onClick={() => setPreviewOpen((open) => !open)}')),
  );
  assert.match(officePreviewButton, /aria-pressed=\{previewOpen\}/);
  assert.match(officePreviewButton, /className=\{`grid h-9 w-9[\s\S]*?border-clay bg-clay-soft text-clay/);
  assert.match(officePreviewButton, /className="flex min-w-0 flex-1 items-center justify-between gap-4 text-left"/);

  assert.match(adminDetail, /const \[previewOpen, setPreviewOpen\] = useState\(true\);/);
  assert.match(adminDetail, /aria-label=\{previewOpen \? 'Hide document preview' : 'Show document preview'\}/);
  assert.match(adminDetail, /aria-pressed=\{previewOpen\}/);
  assert.match(adminDetail, /className=\{`grid h-9 w-9 shrink-0 place-items-center rounded-full border transition-colors[\s\S]*?border-clay bg-clay-soft text-clay/);
  assert.match(adminDetail, /id=\{`admin-document-preview-\$\{sub\.id\}`\} hidden=\{!previewOpen\}/);
});

test('detail RPC masks office-private route comments from submitters', () => {
  const commentsStart = detailMigration.indexOf("'comments', case");
  const requirementsStart = detailMigration.indexOf("'requirements_comments', case");
  const outcomeStart = detailMigration.indexOf("'outcome', step.outcome", requirementsStart);
  assert.notEqual(commentsStart, -1);
  assert.notEqual(requirementsStart, -1);
  assert.notEqual(outcomeStart, -1);
  const commentsMask = detailMigration.slice(commentsStart, requirementsStart);
  const requirementsMask = detailMigration.slice(requirementsStart, outcomeStart);
  assert.ok(commentsMask.includes('step.assigned_by_role = actor_role'));
  assert.ok(commentsMask.includes('then step.comments'));
  assert.ok(commentsMask.includes('else null'));
  assert.ok(requirementsMask.includes('step.assigned_by_role = public.workflow_mvp_active_role()'));
  assert.ok(requirementsMask.includes('then step.requirements_comments'));
  assert.ok(requirementsMask.includes('else null'));
  assert.doesNotMatch(panel, /step\.comments|entry\.comments/);
});
