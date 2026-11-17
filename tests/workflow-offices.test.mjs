import assert from 'node:assert/strict';
import test from 'node:test';
import {
  OFFICE_CONFIG,
  TOURISM_OFFICE_DOCUMENT_TYPE_GROUPS,
} from '../lib/workflow/offices.ts';

test('Mayor office offers common paper requests and keeps Other for custom requests', () => {
  assert.deepEqual(OFFICE_CONFIG.mayor_office.categories, [
    'Request for Mayor\'s Approval',
    'Request for Mayor\'s Signature',
    'Request for Certificate of Residency',
    'Request for Financial Assistance',
    'Request for Medical Assistance',
    'Request for Burial Assistance',
    'Request for Sponsorship',
    'Request for Use of Municipal Facilities',
    'Request for Equipment or Vehicle Use',
    'Request for Endorsement Letter',
    'Request for Authority to Conduct an Event',
    'Request for Certificate of Appreciation',
    'Request for Executive Clearance',
    'Request for Official Communication',
    'Other',
  ]);
});

test('Treasurer and Sangguniang Bayan offer their common paper requests', () => {
  assert.deepEqual(OFFICE_CONFIG.municipal_treasurer.categories, [
    'Request for Tax Clearance',
    'Request for Tax Declaration-related Certification',
    'Request for Business Tax Assessment',
    'Request for Real Property Tax Assessment',
    'Request for Real Property Tax Clearance',
    'Request for Official Receipt',
    'Request for Payment Certification',
    'Request for Tax Payment History',
    'Request for Refund',
    'Request for Tax Computation',
    'Request for Market Stall Rental Assessment',
    'Request for Business Permit Payment Assessment',
    'Request for Certification of No Tax Liability',
    'Request for Trust Fund or Deposit Certification',
    'Other',
  ]);
  assert.deepEqual(OFFICE_CONFIG.sangguniang_bayan.categories, [
    'Request for Certified True Copy of Resolution',
    'Request for Certified True Copy of Ordinance',
    'Request for Legislative Records',
    'Request for Sponsorship or Resolution of Support',
    'Request for Passage of a Resolution',
    'Request for Ordinance',
    'Request for Legislative Endorsement',
    'Request for Certification of Legislative Action',
    'Request for Committee Hearing',
    'Request for Committee Investigation or Review',
    'Request for Certified Minutes of Session',
    'Request for Legislative Approval',
    'Request for Public Hearing',
    'Other',
  ]);
});

test('Tourism requests are grouped into three categories with a custom Other option', () => {
  assert.deepEqual(
    TOURISM_OFFICE_DOCUMENT_TYPE_GROUPS.map((group) => group.label),
    [
      'Tourism Statistics and Data',
      'Tourism Profile and Information',
      'Classification of Accommodation Establishments',
    ]
  );
  assert.equal(
    TOURISM_OFFICE_DOCUMENT_TYPE_GROUPS.reduce(
      (count, group) => count + group.documentTypes.length,
      0
    ),
    19
  );
  assert.deepEqual(
    OFFICE_CONFIG.tourism_officer.categories,
    [
      ...TOURISM_OFFICE_DOCUMENT_TYPE_GROUPS.flatMap(
        (group) => group.documentTypes
      ),
      'Other',
    ]
  );
});
