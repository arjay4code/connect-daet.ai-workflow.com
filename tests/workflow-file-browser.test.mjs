import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  ADMIN_DOCUMENT_PAGE_SIZE,
  paginateFileBrowserItems,
  getDashboardSubmissionPreview,
  matchesFileBrowserFilter,
  matchesOfficeFileBrowserFilter,
  sortFileBrowserSubmissions,
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

test('admin document lists can sort and paginate without dropping records', () => {
  const submissions = [
    { id: '2', created_at: '2026-01-02T00:00:00Z', file_name: 'b.pdf', status: 'pending', tracking_number: 'REQ-2' },
    { id: '1', created_at: '2026-01-03T00:00:00Z', file_name: 'a.pdf', status: 'completed', tracking_number: 'REQ-1' },
    { id: '3', created_at: '2026-01-01T00:00:00Z', file_name: 'c.pdf', status: 'pending', tracking_number: null },
  ];

  assert.deepEqual(sortFileBrowserSubmissions(submissions, 'newest').map(({ id }) => id), ['1', '2', '3']);
  assert.deepEqual(sortFileBrowserSubmissions(submissions, 'file_name_asc').map(({ id }) => id), ['1', '2', '3']);
  assert.deepEqual(sortFileBrowserSubmissions(submissions, 'tracking_number_desc').map(({ id }) => id), ['2', '1', '3']);

  const firstPage = paginateFileBrowserItems(['a', 'b', 'c'], 1, 2);
  assert.deepEqual(firstPage, { items: ['a', 'b'], page: 1, totalPages: 2, start: 1, end: 2 });
  assert.deepEqual(paginateFileBrowserItems(['a', 'b', 'c'], 9, 2), {
    items: ['c'],
    page: 2,
    totalPages: 2,
    start: 3,
    end: 3,
  });
  assert.deepEqual(paginateFileBrowserItems([], 1, 20), {
    items: [],
    page: 1,
    totalPages: 1,
    start: 0,
    end: 0,
  });

  const manyRequests = Array.from({ length: 101 }, (_, index) => `request-${index + 1}`);
  assert.equal(ADMIN_DOCUMENT_PAGE_SIZE, 100);
  const firstHundredRequests = paginateFileBrowserItems(manyRequests, 1, ADMIN_DOCUMENT_PAGE_SIZE);
  assert.equal(firstHundredRequests.items.length, ADMIN_DOCUMENT_PAGE_SIZE);
  const lastPage = paginateFileBrowserItems(manyRequests, 2, ADMIN_DOCUMENT_PAGE_SIZE);
  assert.deepEqual(lastPage, {
    items: ['request-101'],
    page: 2,
    totalPages: 2,
    start: 101,
    end: 101,
  });
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

test('user and office dashboards keep their compact submission previews', async () => {
  const paths = [
    '../app/(dashboard)/workflow/user/page.tsx',
    '../components/OfficeDashboard.tsx',
  ];
  const files = await Promise.all(paths.map((path) =>
    readFile(new URL(path, import.meta.url), 'utf8')
  ));
  for (const file of files) assert.match(file, /getDashboardSubmissionPreview/);
});

test('admin document views use consistent shared controls and fixed 100-row pages', async () => {
  const paths = [
    '../app/(dashboard)/workflow/admin/page.tsx',
    '../app/(dashboard)/workflow/admin/submissions/page.tsx',
  ];
  const files = await Promise.all(paths.map((path) =>
    readFile(new URL(path, import.meta.url), 'utf8')
  ));
  for (const file of files) {
    assert.match(file, /FileBrowserSortSelect/);
    assert.match(file, /FileBrowserPagination/);
    assert.match(file, /ADMIN_DOCUMENT_PAGE_SIZE/);
    assert.doesNotMatch(file, /Rows per page/);
  }

  const [filterControl, sortControl] = await Promise.all([
    readFile(new URL('../components/FileBrowserFilterSelect.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../components/FileBrowserSortSelect.tsx', import.meta.url), 'utf8'),
  ]);
  assert.match(filterControl, /h-12 w-full items-center gap-3 rounded-full/);
  assert.match(sortControl, /h-12 w-full items-center gap-3 rounded-full/);
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
