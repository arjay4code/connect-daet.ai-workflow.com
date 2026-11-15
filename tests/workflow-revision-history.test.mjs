import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  getCurrentWorkflowRevisionFiles,
  getWorkflowRevisionFileChanges,
  parseWorkflowRevisionHistory,
} from '../lib/workflow/revisions.ts';

const migration = await readFile(
  new URL('../supabase/migrations/20261114090000_add_workflow_submission_revision_history.sql', import.meta.url),
  'utf8',
);
const timeline = await readFile(
  new URL('../components/WorkflowRevisionTimeline.tsx', import.meta.url),
  'utf8',
);
const revisions = await readFile(
  new URL('../lib/workflow/revisions.ts', import.meta.url),
  'utf8',
);
const submitterPage = await readFile(
  new URL('../app/(dashboard)/workflow/user/file_registry/[id]/page.tsx', import.meta.url),
  'utf8',
);
const officePage = await readFile(
  new URL('../components/OfficeSubmissionDetail.tsx', import.meta.url),
  'utf8',
);
const adminPage = await readFile(
  new URL('../app/(dashboard)/workflow/admin/submissions/[id]/page.tsx', import.meta.url),
  'utf8',
);
const initialRevisionMigration = await readFile(
  new URL('../supabase/migrations/20261115170000_seed_initial_submission_revisions.sql', import.meta.url),
  'utf8',
);

test('revision history schema is additive and scoped by existing submission access', () => {
  assert.match(migration, /create table if not exists public\.workflow_submission_revisions/);
  assert.match(migration, /create table if not exists public\.workflow_revision_files/);
  assert.match(migration, /create table if not exists public\.workflow_change_requests/);
  assert.match(migration, /workflow_revision_files_one_primary_per_revision_idx/);
  assert.match(migration, /where status = 'open'/);
  assert.match(migration, /public\.is_active_workflow_account\(\)/);
  assert.match(migration, /public\.is_workflow_admin\(\)/);
  assert.match(migration, /public\.is_submission_assigned_to_current_office\(submission\.id\)/);
  assert.match(migration, /change_request_repair_needed/);
  assert.match(migration, /backfill_quality,[\s\S]*?'partial'/);
});

test('detail RPC validates active authorized access and returns revision history without signed URLs', () => {
  assert.match(migration, /create or replace function public\.get_workflow_submission_detail/);
  assert.match(migration, /if not public\.is_active_workflow_account\(\) then/);
  assert.match(migration, /Submission not found or not available to this account/);
  assert.match(migration, /'revisions', coalesce/);
  assert.match(migration, /'change_requests', coalesce/);
  assert.match(migration, /'audit_events', coalesce/);
  assert.match(migration, /revision_file\.storage_path/);
  assert.match(
    migration,
    /'supporting_files', coalesce\([\s\S]*?revision_file\.revision_id = submission\.current_revision_id[\s\S]*?revision_file\.change_kind <> 'removed'/,
  );
  assert.doesNotMatch(migration, /'signed_url'\s*,/i);
});

test('all authorized detail views load the shared revision timeline as a standalone panel', () => {
  for (const page of [submitterPage, officePage, adminPage]) {
    assert.match(page, /loadWorkflowSubmissionDetail/);
    assert.match(page, /<WorkflowRevisionTimeline/);
    assert.match(page, /useSubmissionDetailRealtime/);
    assert.ok(page.indexOf('<DocumentMessaging') < page.indexOf('<WorkflowRevisionTimeline'));
  }
});

test('initial and legacy submissions receive a current revision and supporting files', () => {
  assert.match(initialRevisionMigration, /workflow_mvp_seed_initial_submission_revision/);
  assert.match(initialRevisionMigration, /after insert on public\.workflow_submissions/);
  assert.match(initialRevisionMigration, /after insert on public\.workflow_submission_attachments/);
  assert.match(initialRevisionMigration, /set current_revision_id = new_revision_id/);
  assert.match(initialRevisionMigration, /where submission\.current_revision_id is null/);
  assert.match(initialRevisionMigration, /attachment\.id,[\s\S]*?'supporting'/);
});

test('revision timeline uses authorized signed previews/downloads and displays entries oldest to newest', () => {
  assert.match(timeline, /createSignedUrl\(file\.storagePath, 60\)/);
  assert.match(timeline, /<FilePreview/);
  assert.match(timeline, /onPreview={handlePreview}/);
  assert.match(timeline, /Version \{entry\.revision\.revisionNo\}/);
  assert.match(timeline, /Changes requested by/);
  assert.match(timeline, /a\.createdAt\.localeCompare\(b\.createdAt\)/);
  assert.match(timeline, /role="alert"/);
  assert.match(revisions, /parseWorkflowRevisionHistory/);
  assert.match(revisions, /backfill_quality/);
});

test('revision history parser validates the RPC response shape', () => {
  const parsed = parseWorkflowRevisionHistory({
    submission: { change_request_repair_needed: false },
    revisions: [{
      id: 'revision-id',
      revision_no: 1,
      created_at: '2026-11-14T00:00:00Z',
      submitter_message: null,
      form_snapshot: null,
      backfill_quality: 'partial',
      files: [{
        id: 'file-id',
        logical_file_id: 'logical-id',
        file_role: 'primary',
        file_name: 'application.pdf',
        storage_path: 'user-id/application.pdf',
        file_type: 'application/pdf',
        file_size: 100,
        change_kind: 'added',
        prior_revision_file_id: null,
        created_at: '2026-11-14T00:00:00Z',
      }],
    }],
    change_requests: [],
    audit_events: [],
  });

  assert.equal(parsed.revisions[0]?.files[0]?.changeKind, 'added');
  assert.throws(() => parseWorkflowRevisionHistory({ revisions: [], change_requests: null, audit_events: [] }));
});

test('current supporting files come from the newest manifest and exclude removal tombstones', () => {
  const parsed = parseWorkflowRevisionHistory({
    submission: { change_request_repair_needed: false },
    revisions: [
      {
        id: 'revision-1',
        revision_no: 1,
        created_at: '2026-11-14T00:00:00Z',
        submitter_message: null,
        form_snapshot: null,
        backfill_quality: 'partial',
        files: [
          {
            id: 'primary-1',
            logical_file_id: 'primary',
            file_role: 'primary',
            file_name: 'application.pdf',
            storage_path: 'user-id/application.pdf',
            file_type: 'application/pdf',
            file_size: 100,
            change_kind: 'added',
            prior_revision_file_id: null,
            created_at: '2026-11-14T00:00:00Z',
          },
          {
            id: 'attachment-1',
            logical_file_id: 'attachment',
            file_role: 'supporting',
            file_name: 'support.pdf',
            storage_path: 'user-id/support.pdf',
            file_type: 'application/pdf',
            file_size: 100,
            change_kind: 'added',
            prior_revision_file_id: null,
            created_at: '2026-11-14T00:00:00Z',
          },
        ],
      },
      {
        id: 'revision-2',
        revision_no: 2,
        created_at: '2026-11-15T00:00:00Z',
        submitter_message: null,
        form_snapshot: null,
        backfill_quality: 'complete',
        files: [
          {
            id: 'primary-2',
            logical_file_id: 'primary',
            file_role: 'primary',
            file_name: 'application-v2.pdf',
            storage_path: 'user-id/application-v2.pdf',
            file_type: 'application/pdf',
            file_size: 120,
            change_kind: 'replaced',
            prior_revision_file_id: 'primary-1',
            created_at: '2026-11-15T00:00:00Z',
          },
          {
            id: 'attachment-2',
            logical_file_id: 'attachment',
            file_role: 'supporting',
            file_name: 'support.pdf',
            storage_path: 'user-id/support.pdf',
            file_type: 'application/pdf',
            file_size: 100,
            change_kind: 'removed',
            prior_revision_file_id: 'attachment-1',
            created_at: '2026-11-15T00:00:00Z',
          },
        ],
      },
    ],
    change_requests: [],
    audit_events: [],
  });

  assert.deepEqual(
    getCurrentWorkflowRevisionFiles(parsed).map((file) => file.id),
    ['primary-2'],
  );
});

test('revision file diffs link replacements and removals to the previous snapshot', () => {
  const parsed = parseWorkflowRevisionHistory({
    submission: { change_request_repair_needed: false },
    revisions: [
      {
        id: 'revision-1',
        revision_no: 1,
        created_at: '2026-11-14T00:00:00Z',
        submitter_message: null,
        form_snapshot: null,
        backfill_quality: 'complete',
        files: [
          {
            id: 'primary-v1',
            logical_file_id: 'primary',
            file_role: 'primary',
            file_name: 'application.pdf',
            storage_path: 'user-id/application.pdf',
            file_type: 'application/pdf',
            file_size: 100,
            change_kind: 'added',
            prior_revision_file_id: null,
            created_at: '2026-11-14T00:00:00Z',
          },
          {
            id: 'support-v1',
            logical_file_id: 'support',
            file_role: 'supporting',
            file_name: 'proof.pdf',
            storage_path: 'user-id/proof.pdf',
            file_type: 'application/pdf',
            file_size: 100,
            change_kind: 'added',
            prior_revision_file_id: null,
            created_at: '2026-11-14T00:00:00Z',
          },
        ],
      },
      {
        id: 'revision-2',
        revision_no: 2,
        created_at: '2026-11-15T00:00:00Z',
        submitter_message: null,
        form_snapshot: null,
        backfill_quality: 'complete',
        files: [
          {
            id: 'primary-v2',
            logical_file_id: 'primary',
            file_role: 'primary',
            file_name: 'application-revised.pdf',
            storage_path: 'user-id/application-revised.pdf',
            file_type: 'application/pdf',
            file_size: 120,
            change_kind: 'replaced',
            prior_revision_file_id: 'primary-v1',
            created_at: '2026-11-15T00:00:00Z',
          },
          {
            id: 'support-v2',
            logical_file_id: 'support',
            file_role: 'supporting',
            file_name: 'proof.pdf',
            storage_path: 'user-id/proof.pdf',
            file_type: 'application/pdf',
            file_size: 100,
            change_kind: 'removed',
            prior_revision_file_id: 'support-v1',
            created_at: '2026-11-15T00:00:00Z',
          },
          {
            id: 'new-support',
            logical_file_id: 'new-support',
            file_role: 'supporting',
            file_name: 'extra.pdf',
            storage_path: 'user-id/extra.pdf',
            file_type: 'application/pdf',
            file_size: 110,
            change_kind: 'added',
            prior_revision_file_id: null,
            created_at: '2026-11-15T00:00:00Z',
          },
        ],
      },
    ],
    change_requests: [],
    audit_events: [],
  });

  const changes = getWorkflowRevisionFileChanges(
    parsed.revisions[1],
    parsed.revisions[0],
  );
  assert.deepEqual(
    changes.map((change) => [
      change.changeKind,
      change.previousFile?.fileName ?? null,
      change.currentFile?.fileName ?? null,
    ]),
    [
      ['replaced', 'application.pdf', 'application-revised.pdf'],
      ['removed', 'proof.pdf', null],
      ['added', null, 'extra.pdf'],
    ],
  );
});
