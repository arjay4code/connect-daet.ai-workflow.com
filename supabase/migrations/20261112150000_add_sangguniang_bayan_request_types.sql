insert into public.workflow_office_document_types (office_role, document_type)
values
  ('sangguniang_bayan', 'Request for Certified True Copy of Resolution'),
  ('sangguniang_bayan', 'Request for Certified True Copy of Ordinance'),
  ('sangguniang_bayan', 'Request for Legislative Records'),
  ('sangguniang_bayan', 'Request for Sponsorship or Resolution of Support'),
  ('sangguniang_bayan', 'Request for Passage of a Resolution'),
  ('sangguniang_bayan', 'Request for Ordinance'),
  ('sangguniang_bayan', 'Request for Legislative Endorsement'),
  ('sangguniang_bayan', 'Request for Certification of Legislative Action'),
  ('sangguniang_bayan', 'Request for Committee Hearing'),
  ('sangguniang_bayan', 'Request for Committee Investigation or Review'),
  ('sangguniang_bayan', 'Request for Certified Minutes of Session'),
  ('sangguniang_bayan', 'Request for Legislative Approval'),
  ('sangguniang_bayan', 'Request for Public Hearing')
on conflict (office_role, document_type) do nothing;
