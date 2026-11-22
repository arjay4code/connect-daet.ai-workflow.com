import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculateWorkflowReportAverages,
  formatReportDuration,
} from '../lib/workflow/report-metrics.ts';

const row = (overrides = {}) => ({
  status: 'in_process',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  verified_at: null,
  office_reviewed_at: null,
  approved_at: null,
  completed_at: null,
  auditLogs: [],
  ...overrides,
});

test('report averages use current workflow timestamps and audit-event fallbacks', () => {
  const averages = calculateWorkflowReportAverages([
    row({
      status: 'completed',
      verified_at: '2026-01-01T01:00:00Z',
      office_reviewed_at: '2026-01-01T02:00:00Z',
      approved_at: '2026-01-01T05:00:00Z',
      completed_at: '2026-01-01T06:00:00Z',
    }),
    row({
      auditLogs: [
        { action_type: 'ADMIN_VERIFIED', created_at: '2026-01-01T04:00:00Z' },
        { action_type: 'OFFICE_FINAL_DECISION', created_at: '2026-01-01T07:00:00Z' },
      ],
    }),
  ]);

  assert.deepEqual(averages, {
    timeToReview: 3,
    reviewToDecision: 3,
    timeToCompletion: 6,
  });
});

test('report averages ignore invalid or out-of-order timestamps', () => {
  const averages = calculateWorkflowReportAverages([
    row({
      verified_at: 'not-a-date',
      approved_at: '2025-12-31T23:00:00Z',
      completed_at: 'not-a-date',
    }),
    row({
      status: 'returned_for_requirements',
      updated_at: '2026-01-05T00:00:00Z',
    }),
  ]);

  assert.deepEqual(averages, {
    timeToReview: null,
    reviewToDecision: null,
    timeToCompletion: null,
  });
});

test('report duration formatting gives readable values or an explicit no-data label', () => {
  assert.equal(formatReportDuration(null), 'No data yet');
  assert.equal(formatReportDuration(0), '0 sec');
  assert.equal(formatReportDuration(0.5), '30.0 min');
  assert.equal(formatReportDuration(2), '2.0 h');
  assert.equal(formatReportDuration(48), '2.0 days');
});
