import assert from 'node:assert/strict';
import test from 'node:test';
import { OFFICE_CONFIG } from '../lib/workflow/offices.ts';
import {
  getSupportingDocumentSuggestions,
  MAYOR_OFFICE_SUPPORTING_DOCUMENT_SUGGESTIONS,
  MUNICIPAL_TREASURER_SUPPORTING_DOCUMENT_SUGGESTIONS,
  SANGGUNIANG_BAYAN_SUPPORTING_DOCUMENT_SUGGESTIONS,
  TOURISM_OFFICE_SUPPORTING_DOCUMENT_SUGGESTIONS,
} from '../lib/workflow/supporting-document-suggestions.ts';

test('every standard Mayor office request type has its mapped suggestions', () => {
  const expectedSuggestions = {
    "Request for Mayor's Approval": [
      'Formal Request Letter',
      'Supporting Endorsement Documents',
    ],
    "Request for Mayor's Signature": ['Formal Request Letter'],
    'Request for Certificate of Residency': [
      'Valid Government-Issued ID',
      'Barangay Certification (when required)',
    ],
    'Request for Financial Assistance': [
      'Formal Request Letter',
      'Valid Government-Issued ID',
      'Barangay Certification (when required)',
    ],
    'Request for Medical Assistance': [
      'Medical Certificate',
      'Hospital Bill or Medical Statement',
      'Valid Government-Issued ID',
    ],
    'Request for Burial Assistance': [
      'Death Certificate (for burial assistance)',
      'Funeral Contract or Burial Documents',
      'Valid Government-Issued ID',
    ],
    'Request for Sponsorship': [
      'Formal Request Letter',
      'Project Proposal (when applicable)',
    ],
    'Request for Use of Municipal Facilities': [
      'Formal Request Letter',
      'Event Proposal',
      'Activity Program',
    ],
    'Request for Equipment or Vehicle Use': [
      'Formal Request Letter',
      'Activity Program',
    ],
    'Request for Endorsement Letter': [
      'Formal Request Letter',
      'Supporting Endorsement Documents',
    ],
    'Request for Authority to Conduct an Event': [
      'Event Proposal',
      'Activity Program',
      'Barangay Certification (when required)',
    ],
    'Request for Certificate of Appreciation': ['Formal Request Letter'],
    'Request for Executive Clearance': [
      'Valid Government-Issued ID',
      'Supporting Endorsement Documents',
    ],
    'Request for Official Communication': [
      'Formal Request Letter',
      'Supporting Endorsement Documents',
    ],
  };
  const requestTypes = OFFICE_CONFIG.mayor_office.categories.filter(
    (documentType) => documentType !== 'Other'
  );

  assert.deepEqual(MAYOR_OFFICE_SUPPORTING_DOCUMENT_SUGGESTIONS, expectedSuggestions);
  assert.deepEqual(
    Object.keys(MAYOR_OFFICE_SUPPORTING_DOCUMENT_SUGGESTIONS).sort(),
    [...requestTypes].sort()
  );
});

test('Other and unknown document types have no predefined suggestions', () => {
  assert.deepEqual(getSupportingDocumentSuggestions('mayor_office', 'Other'), []);
  assert.deepEqual(
    getSupportingDocumentSuggestions('mayor_office', 'A custom request title'),
    []
  );
  assert.deepEqual(getSupportingDocumentSuggestions('mayor_office', ''), []);
});

test('every standard Treasurer request type has its mapped suggestions', () => {
  const expectedSuggestions = {
    'Request for Tax Clearance': [
      'Valid Government-Issued ID',
      'Tax Declaration',
      'Property Reference Documents',
      'Proof of Payment',
    ],
    'Request for Tax Declaration-related Certification': [
      'Valid Government-Issued ID',
      'Tax Declaration',
      'Property Reference Documents',
    ],
    'Request for Business Tax Assessment': [
      'Valid Government-Issued ID',
      'Business Permit Application',
      'Business Registration Documents',
      'Tax Identification Number (TIN), when required',
    ],
    'Request for Real Property Tax Assessment': [
      'Valid Government-Issued ID',
      'Tax Declaration',
      'Property Reference Documents',
      'Real Property Tax Records',
    ],
    'Request for Real Property Tax Clearance': [
      'Valid Government-Issued ID',
      'Tax Declaration',
      'Real Property Tax Records',
      'Proof of Payment',
    ],
    'Request for Official Receipt': [
      'Valid Government-Issued ID',
      'Previous Official Receipt',
      'Proof of Payment',
    ],
    'Request for Payment Certification': [
      'Valid Government-Issued ID',
      'Previous Official Receipt',
      'Proof of Payment',
    ],
    'Request for Tax Payment History': [
      'Valid Government-Issued ID',
      'Previous Official Receipt',
      'Real Property Tax Records',
    ],
    'Request for Refund': [
      'Valid Government-Issued ID',
      'Refund Request Letter',
      'Proof of Payment',
      'Previous Official Receipt',
    ],
    'Request for Tax Computation': [
      'Valid Government-Issued ID',
      'Tax Declaration',
      'Property Reference Documents',
      'Real Property Tax Records',
    ],
    'Request for Market Stall Rental Assessment': [
      'Valid Government-Issued ID',
      'Previous Official Receipt',
      'Property Reference Documents',
    ],
    'Request for Business Permit Payment Assessment': [
      'Valid Government-Issued ID',
      'Business Permit Application',
      'Business Registration Documents',
      'Tax Identification Number (TIN), when required',
    ],
    'Request for Certification of No Tax Liability': [
      'Valid Government-Issued ID',
      'Tax Declaration',
      'Property Reference Documents',
      'Real Property Tax Records',
    ],
    'Request for Trust Fund or Deposit Certification': [
      'Valid Government-Issued ID',
      'Deposit or Trust Fund Records',
      'Previous Official Receipt',
      'Proof of Payment',
    ],
  };
  const requestTypes = OFFICE_CONFIG.municipal_treasurer.categories.filter(
    (documentType) => documentType !== 'Other'
  );

  assert.deepEqual(
    MUNICIPAL_TREASURER_SUPPORTING_DOCUMENT_SUGGESTIONS,
    expectedSuggestions
  );
  assert.deepEqual(
    Object.keys(MUNICIPAL_TREASURER_SUPPORTING_DOCUMENT_SUGGESTIONS).sort(),
    [...requestTypes].sort()
  );
  assert.deepEqual(getSupportingDocumentSuggestions('municipal_treasurer', 'Other'), []);
  assert.deepEqual(
    getSupportingDocumentSuggestions('municipal_treasurer', 'A custom request'),
    []
  );
});

test('every standard Sangguniang Bayan request type has its mapped suggestions', () => {
  const expectedSuggestions = {
    'Request for Certified True Copy of Resolution': [
      'Valid Government-Issued ID',
      'Previous Resolution Reference Number',
      'Authorization Letter (if represented by another person)',
    ],
    'Request for Certified True Copy of Ordinance': [
      'Valid Government-Issued ID',
      'Previous Ordinance Reference Number',
      'Authorization Letter (if represented by another person)',
    ],
    'Request for Legislative Records': [
      'Formal Request Letter',
      'Valid Government-Issued ID',
      'Authorization Letter (if represented by another person)',
    ],
    'Request for Sponsorship or Resolution of Support': [
      'Formal Request Letter',
      'Project Proposal',
      'Supporting Justification',
      'Relevant Endorsement Letters',
    ],
    'Request for Passage of a Resolution': [
      'Formal Request Letter',
      'Proposed Resolution',
      'Supporting Justification',
      'Relevant Endorsement Letters',
    ],
    'Request for Ordinance': [
      'Formal Request Letter',
      'Proposed Ordinance',
      'Supporting Justification',
      'Project Proposal',
    ],
    'Request for Legislative Endorsement': [
      'Formal Request Letter',
      'Project Proposal',
      'Supporting Justification',
      'Relevant Endorsement Letters',
    ],
    'Request for Certification of Legislative Action': [
      'Formal Request Letter',
      'Valid Government-Issued ID',
      'Previous Resolution Reference Number',
      'Previous Ordinance Reference Number',
    ],
    'Request for Committee Hearing': [
      'Formal Request Letter',
      'Meeting or Hearing Request Letter',
      'Supporting Evidence or Documentation',
    ],
    'Request for Committee Investigation or Review': [
      'Formal Request Letter',
      'Supporting Evidence or Documentation',
      'Relevant Endorsement Letters',
      'Committee Report (when applicable)',
    ],
    'Request for Certified Minutes of Session': [
      'Formal Request Letter',
      'Valid Government-Issued ID',
      'Authorization Letter (if represented by another person)',
    ],
    'Request for Legislative Approval': [
      'Formal Request Letter',
      'Project Proposal',
      'Supporting Justification',
      'Relevant Endorsement Letters',
    ],
    'Request for Public Hearing': [
      'Formal Request Letter',
      'Meeting or Hearing Request Letter',
      'Proposed Ordinance',
      'Proposed Resolution',
      'Supporting Justification',
    ],
  };
  const requestTypes = OFFICE_CONFIG.sangguniang_bayan.categories.filter(
    (documentType) => documentType !== 'Other'
  );

  assert.deepEqual(SANGGUNIANG_BAYAN_SUPPORTING_DOCUMENT_SUGGESTIONS, expectedSuggestions);
  assert.deepEqual(
    Object.keys(SANGGUNIANG_BAYAN_SUPPORTING_DOCUMENT_SUGGESTIONS).sort(),
    [...requestTypes].sort()
  );
  assert.deepEqual(
    getSupportingDocumentSuggestions(
      'sangguniang_bayan',
      'Request for Certified True Copy of Resolution'
    ),
    expectedSuggestions['Request for Certified True Copy of Resolution']
  );
  assert.deepEqual(
    getSupportingDocumentSuggestions('sangguniang_bayan', 'Other'),
    []
  );
});

test('unmapped offices and request types have no suggestions', () => {
  assert.deepEqual(getSupportingDocumentSuggestions('tourism_officer', 'Other'), []);
  assert.deepEqual(
    getSupportingDocumentSuggestions(
      'sangguniang_bayan',
      'An unknown request type'
    ),
    []
  );
});

test('every standard Tourism Office request has its mapped suggestions', () => {
  const expectedSuggestions = {
    'Request for Annual Tourism Statistics': [
      'Formal Request Letter',
      'Valid Government-Issued ID',
      'Research Proposal (for academic research)',
      'Specific Data Request Form',
      'School Endorsement Letter (for students)',
      'Research Questionnaire (when applicable)',
      'Letter of Introduction from the Organization (when applicable)',
      'Letter of Authorization (if represented by another person)',
      'Data Privacy Undertaking (when required)',
    ],
    'Request for Monthly Tourism Statistics': [
      'Formal Request Letter',
      'Valid Government-Issued ID',
      'Research Proposal (for academic research)',
      'Specific Data Request Form',
      'School Endorsement Letter (for students)',
      'Research Questionnaire (when applicable)',
      'Letter of Introduction from the Organization (when applicable)',
      'Letter of Authorization (if represented by another person)',
      'Data Privacy Undertaking (when required)',
    ],
    'Request for Quarterly Tourism Statistics': [
      'Formal Request Letter',
      'Valid Government-Issued ID',
      'Research Proposal (for academic research)',
      'Specific Data Request Form',
      'School Endorsement Letter (for students)',
      'Research Questionnaire (when applicable)',
      'Letter of Introduction from the Organization (when applicable)',
      'Letter of Authorization (if represented by another person)',
      'Data Privacy Undertaking (when required)',
    ],
    'Request for Local and Foreign Tourist Arrival Statistics': [
      'Formal Request Letter',
      'Valid Government-Issued ID',
      'Research Proposal (for academic research)',
      'Specific Data Request Form',
      'School Endorsement Letter (for students)',
      'Research Questionnaire (when applicable)',
      'Letter of Introduction from the Organization (when applicable)',
      'Letter of Authorization (if represented by another person)',
      'Data Privacy Undertaking (when required)',
    ],
    'Request for Tourist Arrival Statistics per Destination': [
      'Formal Request Letter',
      'Valid Government-Issued ID',
      'Research Proposal (for academic research)',
      'Specific Data Request Form',
      'School Endorsement Letter (for students)',
      'Research Questionnaire (when applicable)',
      'Letter of Introduction from the Organization (when applicable)',
      'Letter of Authorization (if represented by another person)',
      'Data Privacy Undertaking (when required)',
    ],
    'Request for Museum and Heritage Site Visitor Statistics': [
      'Formal Request Letter',
      'Valid Government-Issued ID',
      'Research Proposal (for academic research)',
      'Specific Data Request Form',
      'School Endorsement Letter (for students)',
      'Research Questionnaire (when applicable)',
      'Letter of Introduction from the Organization (when applicable)',
      'Letter of Authorization (if represented by another person)',
      'Data Privacy Undertaking (when required)',
    ],
    'Request for Festival and Special Event Tourist Statistics': [
      'Formal Request Letter',
      'Valid Government-Issued ID',
      'Research Proposal (for academic research)',
      'Specific Data Request Form',
      'School Endorsement Letter (for students)',
      'Research Questionnaire (when applicable)',
      'Letter of Introduction from the Organization (when applicable)',
      'Letter of Authorization (if represented by another person)',
      'Data Privacy Undertaking (when required)',
    ],
    'Request for List of Accommodation Establishments': [
      'Formal Request Letter',
      'Valid Government-Issued ID',
      'Specific Data Request Form',
      'School Endorsement Letter (for students)',
      'Research Questionnaire (when applicable)',
      'Letter of Introduction from the Organization (when applicable)',
      'Letter of Authorization (if represented by another person)',
      'Data Privacy Undertaking (when required)',
    ],
    'Request for List of Accredited Tourism Establishments': [
      'Formal Request Letter',
      'Valid Government-Issued ID',
      'Specific Data Request Form',
      'School Endorsement Letter (for students)',
      'Research Questionnaire (when applicable)',
      'Letter of Introduction from the Organization (when applicable)',
      'Letter of Authorization (if represented by another person)',
      'Data Privacy Undertaking (when required)',
    ],
    'Request for List of Tourist Attractions in Daet': [
      'Formal Request Letter',
      'Valid Government-Issued ID',
      'Specific Information Request Form',
      'School Endorsement Letter (for students)',
      'Letter of Introduction from the Organization (when applicable)',
      'Letter of Authorization (if represented by another person)',
    ],
    'Request for Historical Background of Daet': [
      'Formal Request Letter',
      'Valid Government-Issued ID',
      'Research Proposal (for academic research)',
      'School Endorsement Letter (for students)',
      'Letter of Introduction from the Organization (when applicable)',
      'Letter of Authorization (if represented by another person)',
    ],
    'Request for Local Tourism Products and Services Information': [
      'Formal Request Letter',
      'Valid Government-Issued ID',
      'Specific Information Request Form',
      'School Endorsement Letter (for students)',
      'Letter of Introduction from the Organization (when applicable)',
      'Letter of Authorization (if represented by another person)',
    ],
    'Request for Festivals and Cultural Activities Information': [
      'Formal Request Letter',
      'Valid Government-Issued ID',
      'Research Proposal (for academic research)',
      'School Endorsement Letter (for students)',
      'Letter of Introduction from the Organization (when applicable)',
      'Letter of Authorization (if represented by another person)',
    ],
    'Request for Tourist Destination Descriptions and Locations': [
      'Formal Request Letter',
      'Valid Government-Issued ID',
      'Specific Information Request Form',
      'School Endorsement Letter (for students)',
      'Letter of Introduction from the Organization (when applicable)',
      'Letter of Authorization (if represented by another person)',
    ],
    'Request for List of Accommodation Establishments Operating in Daet': [
      'Formal Request Letter',
      'Valid Government-Issued ID',
      'Specific Establishment Data Request Form',
      'School Endorsement Letter (for students)',
      'Letter of Introduction from the Organization (when applicable)',
      'Letter of Authorization (if represented by another person)',
      'Data Privacy Undertaking (when required)',
    ],
    'Request for List of Restaurants and Food Establishments': [
      'Formal Request Letter',
      'Valid Government-Issued ID',
      'Specific Establishment Data Request Form',
      'School Endorsement Letter (for students)',
      'Letter of Introduction from the Organization (when applicable)',
      'Letter of Authorization (if represented by another person)',
      'Data Privacy Undertaking (when required)',
    ],
    'Request for Primary and Secondary Tourism Enterprise Classification': [
      'Formal Request Letter',
      'Valid Government-Issued ID',
      'Research Proposal (for academic research)',
      'School Endorsement Letter (for students)',
      'Letter of Introduction from the Organization (when applicable)',
      'Letter of Authorization (if represented by another person)',
      'Data Privacy Undertaking (when required)',
    ],
    'Request for Number of Registered or Accredited Tourism Establishments': [
      'Formal Request Letter',
      'Valid Government-Issued ID',
      'Specific Establishment Data Request Form',
      'School Endorsement Letter (for students)',
      'Letter of Introduction from the Organization (when applicable)',
      'Letter of Authorization (if represented by another person)',
      'Data Privacy Undertaking (when required)',
    ],
    'Request for Tourism Establishment Classification and Accreditation Status': [
      'Formal Request Letter',
      'Valid Government-Issued ID',
      'Specific Establishment Data Request Form',
      'School Endorsement Letter (for students)',
      'Letter of Introduction from the Organization (when applicable)',
      'Letter of Authorization (if represented by another person)',
      'Data Privacy Undertaking (when required)',
    ],
  };
  const requestTypes = OFFICE_CONFIG.tourism_officer.categories.filter(
    (documentType) => documentType !== 'Other'
  );

  assert.deepEqual(
    TOURISM_OFFICE_SUPPORTING_DOCUMENT_SUGGESTIONS,
    expectedSuggestions
  );
  assert.deepEqual(
    Object.keys(TOURISM_OFFICE_SUPPORTING_DOCUMENT_SUGGESTIONS).sort(),
    [...requestTypes].sort()
  );
  assert.deepEqual(
    getSupportingDocumentSuggestions(
      'tourism_officer',
      'Request for Annual Tourism Statistics'
    ),
    expectedSuggestions['Request for Annual Tourism Statistics']
  );
});
