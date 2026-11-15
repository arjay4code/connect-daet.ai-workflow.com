insert into public.workflow_office_document_types (office_role, document_type)
values
  ('municipal_treasurer', 'Request for Tax Clearance'),
  ('municipal_treasurer', 'Request for Tax Declaration-related Certification'),
  ('municipal_treasurer', 'Request for Business Tax Assessment'),
  ('municipal_treasurer', 'Request for Real Property Tax Assessment'),
  ('municipal_treasurer', 'Request for Real Property Tax Clearance'),
  ('municipal_treasurer', 'Request for Official Receipt'),
  ('municipal_treasurer', 'Request for Payment Certification'),
  ('municipal_treasurer', 'Request for Tax Payment History'),
  ('municipal_treasurer', 'Request for Refund'),
  ('municipal_treasurer', 'Request for Tax Computation'),
  ('municipal_treasurer', 'Request for Market Stall Rental Assessment'),
  ('municipal_treasurer', 'Request for Business Permit Payment Assessment'),
  ('municipal_treasurer', 'Request for Certification of No Tax Liability'),
  ('municipal_treasurer', 'Request for Trust Fund or Deposit Certification')
on conflict (office_role, document_type) do nothing;
