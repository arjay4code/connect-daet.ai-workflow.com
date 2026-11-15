insert into public.workflow_office_document_types (office_role, document_type)
values
  ('mayor_office', 'Request for Mayor''s Approval'),
  ('mayor_office', 'Request for Mayor''s Signature'),
  ('mayor_office', 'Request for Certificate of Residency'),
  ('mayor_office', 'Request for Financial Assistance'),
  ('mayor_office', 'Request for Medical Assistance'),
  ('mayor_office', 'Request for Burial Assistance'),
  ('mayor_office', 'Request for Sponsorship'),
  ('mayor_office', 'Request for Use of Municipal Facilities'),
  ('mayor_office', 'Request for Equipment or Vehicle Use'),
  ('mayor_office', 'Request for Endorsement Letter'),
  ('mayor_office', 'Request for Authority to Conduct an Event'),
  ('mayor_office', 'Request for Certificate of Appreciation'),
  ('mayor_office', 'Request for Executive Clearance'),
  ('mayor_office', 'Request for Official Communication')
on conflict (office_role, document_type) do nothing;
