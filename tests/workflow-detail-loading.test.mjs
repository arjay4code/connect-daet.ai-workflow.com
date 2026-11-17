import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { loadWorkflowSubmissionDetail } from '../lib/workflow/submission-detail.ts';
import { createCoalescedRefresh } from '../lib/workflow/useSubmissionDetailRealtime.ts';

const migration = await readFile(
  new URL('../supabase/migrations/20261114090000_add_workflow_submission_revision_history.sql', import.meta.url),
  'utf8',
);
const detailLoader = await readFile(
  new URL('../lib/workflow/submission-detail.ts', import.meta.url),
  'utf8',
);
const pages = await Promise.all([
  readFile(new URL('../app/(dashboard)/workflow/user/file_registry/[id]/page.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../components/OfficeSubmissionDetail.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../app/(dashboard)/workflow/admin/submissions/[id]/page.tsx', import.meta.url), 'utf8'),
]);
const realtime = await readFile(
  new URL('../lib/workflow/useSubmissionDetailRealtime.ts', import.meta.url),
  'utf8',
);

const detailPayload = {
  submission: {
    id: 'submission-id',
    user_id: 'submitter-id',
    tracking_number: 'DAET-001',
    file_name: 'application.pdf',
    file_url: 'https://storage.example/application.pdf',
    file_path: 'submitter-id/application.pdf',
    file_type: 'application/pdf',
    file_size: 100,
    status: 'in_process',
    category: 'Permit',
    other_document_type: null,
    description: 'Application',
    purpose: null,
    requested_action: null,
    intended_recipient: null,
    initial_destination_role: 'municipal_treasurer',
    selected_office_role: 'municipal_treasurer',
    current_revision_id: 'revision-id',
    reopen_count: 0,
    closure_reason: null,
    closed_at: null,
    change_request_repair_needed: false,
    received_at: null,
    received_by: null,
    completed_at: null,
    created_at: '2026-11-15T00:00:00Z',
    updated_at: '2026-11-15T00:00:00Z',
    closed_by: null,
    closure_note: null,
    closure_file_path: null,
    closure_file_name: null,
    closure_file_type: null,
    closure_file_size: null,
    approver_comments: null,
    admin_comments: null,
    office_comments: null,
    mayor_comments: null,
    rejection_comment: null,
    sender_response: null,
    archived_at: null,
    retention_until: null,
    final_decision_office_role: null,
    final_decision_by: null,
    final_decided_at: null,
    approved_at: null,
    rejected_at: null,
  },
  sender: { email: 'submitter@example.test', full_name: 'Test Submitter', role: 'submitter' },
  closure_actor: null,
  current_route: {
    id: 'route-id',
    status: 'finalized',
    is_current: true,
    version: 1,
  },
  route_plan_ids: ['route-id'],
  routing_steps: [{
    id: 'step-id',
    routing_plan_id: 'route-id',
    sequence_number: 1,
    office_role: 'municipal_treasurer',
    status: 'in_progress',
    assigned_by: null,
    assigned_by_role: null,
    responsibility: 'Evaluation/Verification',
    assignment_source: 'initial',
    assigned_at: '2026-11-15T00:00:00Z',
    started_at: null,
    decided_at: null,
    decided_by: null,
    completed_at: null,
    completed_by: null,
    comments: null,
    requirements_requested_at: null,
    requirements_comments: null,
    outcome: null,
  }],
  supporting_files: [{
    id: 'supporting-file-id',
    file_name: 'supporting-document.pdf',
    file_path: 'submitter-id/supporting-document.pdf',
    file_type: 'application/pdf',
    file_size: 200,
  }],
  revisions: [],
  change_requests: [],
  audit_events: [],
  activity_logs: [{
    id: 'audit-id',
    action_type: 'SUBMISSION_RECEIVED',
    old_status: 'submitted',
    new_status: 'in_process',
    comments: null,
    created_at: '2026-11-15T00:00:00Z',
    profiles: { full_name: 'Test Officer', email: 'officer@example.test', role: 'municipal_treasurer' },
  }],
};

test('a detail refresh makes one RPC request and parses the full read model', async () => {
  const calls = [];
  const supabase = {
    rpc: async (name, args) => {
      calls.push({ name, args });
      return { data: detailPayload, error: null };
    },
    from: () => {
      throw new Error('Legacy attachment fallback should not run when current revision files are present.');
    },
  };

  const detail = await loadWorkflowSubmissionDetail(supabase, 'submission-id');

  assert.deepEqual(calls, [{
    name: 'get_workflow_submission_detail',
    args: { target_submission_id: 'submission-id' },
  }]);
  assert.equal(detail.submission.id, 'submission-id');
  assert.equal(detail.sender?.full_name, 'Test Submitter');
  assert.equal(detail.routeSteps[0]?.id, 'step-id');
  assert.deepEqual(detail.supportingFiles, [{
    id: 'supporting-file-id',
    file_name: 'supporting-document.pdf',
    file_path: 'submitter-id/supporting-document.pdf',
    file_type: 'application/pdf',
    file_size: 200,
  }]);
  assert.equal(detail.activityLogs[0]?.action_type, 'SUBMISSION_RECEIVED');
});

test('initial submissions load supporting documents from the legacy attachment table', async () => {
  const supabase = {
    rpc: async () => ({
      data: {
        ...detailPayload,
        submission: { ...detailPayload.submission, current_revision_id: null },
        supporting_files: [],
      },
      error: null,
    }),
    from: (table) => {
      assert.equal(table, 'workflow_submission_attachments');
      return {
        select: (columns) => {
          assert.equal(columns, 'id, file_name, file_path, file_type, file_size');
          return {
            eq: (column, value) => {
              assert.equal(column, 'submission_id');
              assert.equal(value, 'submission-id');
              return {
                order: async (orderColumn, options) => {
                  assert.equal(orderColumn, 'created_at');
                  assert.deepEqual(options, { ascending: true });
                  return {
                    data: [{
                      id: 'legacy-file-id',
                      file_name: 'legacy-supporting-document.pdf',
                      file_path: 'submitter-id/legacy-supporting-document.pdf',
                      file_type: 'application/pdf',
                      file_size: 250,
                    }],
                    error: null,
                  };
                },
              };
            },
          };
        },
      };
    },
  };

  const detail = await loadWorkflowSubmissionDetail(supabase, 'submission-id');
  assert.deepEqual(detail.supportingFiles, [{
    id: 'legacy-file-id',
    file_name: 'legacy-supporting-document.pdf',
    file_path: 'submitter-id/legacy-supporting-document.pdf',
    file_type: 'application/pdf',
    file_size: 250,
  }]);
});

test('the detail RPC includes the route, activity, and revision data in one authorized response', () => {
  assert.match(migration, /'route_plan_ids', coalesce/);
  assert.match(migration, /'routing_steps', coalesce/);
  assert.match(migration, /'activity_logs', coalesce/);
  assert.match(migration, /'supporting_files', coalesce/);
  assert.match(migration, /'revisions', coalesce/);
  assert.match(migration, /'change_requests', coalesce/);
  assert.match(migration, /case when submission\.user_id = auth\.uid\(\) then null else profile\.email end/);
  assert.match(migration, /or step\.assigned_by_role = actor_role/);
  assert.match(detailLoader, /supabase\.rpc\('get_workflow_submission_detail'/);
  for (const page of pages.slice(0, 2)) {
    assert.match(page, /loadWorkflowSubmissionDetail/);
    const fetcher = page.match(/const fetch(?:Submission|Details) = useCallback\(async[\s\S]*?\n  \}, \[id, supabase\]\);/)?.[0];
    assert.ok(fetcher, 'Each detail page should have a measurable data-loader boundary.');
    assert.equal((fetcher.match(/loadWorkflowSubmissionDetail/g) ?? []).length, 1);
    assert.doesNotMatch(fetcher, /\.from\('workflow_submissions'\)|\.from\('workflow_routing_plans'\)|\.from\('workflow_routing_steps'\)|\.from\('workflow_audit_logs'\)/);
  }
  assert.equal((pages[0].match(/setAttachments\(detail\.supportingFiles\)/g) ?? []).length, 1);
  assert.equal((pages[1].match(/setAttachments\(detail\.supportingFiles\)/g) ?? []).length, 1);
  assert.match(pages[2], /<OfficeSubmissionDetail readOnly/);
});

test('detail realtime refresh listens to state changes and coalesces event bursts', async () => {
  assert.match(realtime, /table: 'workflow_submissions'/);
  assert.match(realtime, /table: 'workflow_submission_revisions'/);
  assert.match(realtime, /table: 'workflow_change_requests'/);

  let refreshes = 0;
  const refresh = createCoalescedRefresh(() => { refreshes++; }, 10);
  refresh.schedule();
  refresh.schedule();
  refresh.schedule();
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(refreshes, 1);
});

test('failed detail RPCs are surfaced instead of returning empty detail data', async () => {
  const supabase = {
    rpc: async () => ({
      data: null,
      error: { message: 'permission denied' },
    }),
  };
  await assert.rejects(
    loadWorkflowSubmissionDetail(supabase, 'submission-id'),
    /Could not load this submission: permission denied/,
  );
});
