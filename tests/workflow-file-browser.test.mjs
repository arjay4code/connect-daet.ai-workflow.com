import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  getDashboardSubmissionPreview,
  matchesFileBrowserFilter,
  matchesOfficeFileBrowserFilter,
} from '../lib/workflow/file-browser.ts';

const officeRoles = [
  'tourism_officer',
  'municipal_treasurer',
  'mayor_office',
  'sangguniang_bayan',
];

test('dashboard submission previews are capped at five and preserve order', () => {
  assert.deepEqual(
    getDashboardSubmissionPreview(['newest', 'next', 'third', 'fourth', 'fifth', 'older']),
    ['newest', 'next', 'third', 'fourth', 'fifth'],
  );
  assert.deepEqual(getDashboardSubmissionPreview(['newest', 'next']), ['newest', 'next']);
});

test('file browser filters cover workflow statuses without merging terminal outcomes', () => {
  const statusGroups = {
    in_progress: [
      'submitted',
      'in_process',
      'pending',
      'pending_approver',
      'pending_admin',
      'pending_office',
      'pending_mayor',
    ],
    needs_attention: [
      'changes_requested',
      'returned_for_requirements',
      'returned',
    ],
    completed: ['approved', 'completed'],
    rejected: [
      'declined_by_approver',
      'declined_by_admin',
      'declined_by_office',
      'declined_by_mayor',
      'rejected',
    ],
  };
  const filters = Object.keys(statusGroups);

  for (const [filter, statuses] of Object.entries(statusGroups)) {
    for (const status of statuses) {
      assert.equal(matchesFileBrowserFilter(status, filter), true);
      for (const otherFilter of filters.filter((candidate) => candidate !== filter)) {
        assert.equal(matchesFileBrowserFilter(status, otherFilter), false);
      }
      assert.equal(matchesFileBrowserFilter(status, 'all'), true);
    }
  }

  for (const status of ['withdrawn', 'unrecognized_status']) {
    for (const filter of filters) {
      assert.equal(matchesFileBrowserFilter(status, filter), false);
    }
    assert.equal(matchesFileBrowserFilter(status, 'all'), true);
  }
});

test('office file filters respect each office’s assigned and consulted records', () => {
  for (const role of officeRoles) {
    assert.equal(matchesOfficeFileBrowserFilter({
      status: 'pending_office',
      selected_office_role: role,
      officeRecord: null,
    }, 'in_progress', role), true);
  }

  const unrelated = {
    status: 'pending_office',
    selected_office_role: 'sangguniang_bayan',
    officeRecord: null,
    consultedRecord: null,
  };
  assert.equal(matchesOfficeFileBrowserFilter(unrelated, 'all', 'municipal_treasurer'), false);
  assert.equal(matchesOfficeFileBrowserFilter(unrelated, 'in_progress', 'municipal_treasurer'), false);
  assert.equal(matchesOfficeFileBrowserFilter({
    ...unrelated,
    status: 'changes_requested',
    selected_office_role: 'municipal_treasurer',
  }, 'needs_attention', 'municipal_treasurer'), true);
  assert.equal(matchesOfficeFileBrowserFilter({
    ...unrelated,
    status: 'changes_requested',
  }, 'needs_attention', 'municipal_treasurer'), false);
});

test('all file-management lists use the shared status dropdown', async () => {
  const paths = [
    '../app/(dashboard)/workflow/user/file_registry/page.tsx',
    '../components/OfficeDashboard.tsx',
    '../app/(dashboard)/workflow/admin/page.tsx',
    '../app/(dashboard)/workflow/admin/submissions/page.tsx',
  ];
  const files = await Promise.all(paths.map((path) =>
    readFile(new URL(path, import.meta.url), 'utf8')
  ));
  for (const file of files) assert.match(file, /FileBrowserFilterSelect/);

  const dropdown = await readFile(
    new URL('../components/FileBrowserFilterSelect.tsx', import.meta.url),
    'utf8',
  );
  assert.match(dropdown, /<select/);
});

test('all role dashboards cap their submission previews', async () => {
  const paths = [
    '../app/(dashboard)/workflow/user/page.tsx',
    '../components/OfficeDashboard.tsx',
    '../app/(dashboard)/workflow/admin/page.tsx',
  ];
  const files = await Promise.all(paths.map((path) =>
    readFile(new URL(path, import.meta.url), 'utf8')
  ));
  for (const file of files) assert.match(file, /getDashboardSubmissionPreview/);
});

test('only submitter file lists render the routing pipeline', async () => {
  const paths = [
    '../components/OfficeDashboard.tsx',
    '../app/(dashboard)/workflow/admin/page.tsx',
    '../app/(dashboard)/workflow/admin/submissions/page.tsx',
    '../app/(dashboard)/workflow/admin/archive/page.tsx',
    '../app/(dashboard)/workflow/admin/pending/page.tsx',
  ];
  const files = await Promise.all(paths.map((path) =>
    readFile(new URL(path, import.meta.url), 'utf8')
  ));
  for (const file of files) assert.doesNotMatch(file, /WorkflowRoutingPipeline|useRoutePreviews/);

  const userFiles = await readFile(
    new URL('../app/(dashboard)/workflow/user/file_registry/page.tsx', import.meta.url),
    'utf8',
  );
  assert.match(userFiles, /WorkflowRoutingPipeline/);
});
