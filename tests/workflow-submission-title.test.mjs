import assert from 'node:assert/strict';
import test from 'node:test';
import { getWorkflowSubmissionTitle } from '../lib/workflow/offices.ts';

test('submission titles prefer the selected request type and preserve historic file names', () => {
  assert.equal(
    getWorkflowSubmissionTitle('Request for Medical Assistance', 'medical-records.pdf'),
    'Request for Medical Assistance'
  );
  assert.equal(
    getWorkflowSubmissionTitle('Custom burial request', 'request.pdf'),
    'Custom burial request'
  );
  assert.equal(getWorkflowSubmissionTitle(null, 'historic-title.pdf'), 'historic-title.pdf');
  assert.equal(getWorkflowSubmissionTitle('  ', 'historic-title.pdf'), 'historic-title.pdf');
});
