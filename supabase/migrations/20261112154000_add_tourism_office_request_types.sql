insert into public.workflow_office_document_types (office_role, document_type)
values
  ('tourism_officer', 'Request for Annual Tourism Statistics'),
  ('tourism_officer', 'Request for Monthly Tourism Statistics'),
  ('tourism_officer', 'Request for Quarterly Tourism Statistics'),
  ('tourism_officer', 'Request for Local and Foreign Tourist Arrival Statistics'),
  ('tourism_officer', 'Request for Tourist Arrival Statistics per Destination'),
  ('tourism_officer', 'Request for Museum and Heritage Site Visitor Statistics'),
  ('tourism_officer', 'Request for Festival and Special Event Tourist Statistics'),
  ('tourism_officer', 'Request for List of Accommodation Establishments'),
  ('tourism_officer', 'Request for List of Accredited Tourism Establishments'),
  ('tourism_officer', 'Request for List of Tourist Attractions in Daet'),
  ('tourism_officer', 'Request for Historical Background of Daet'),
  ('tourism_officer', 'Request for Local Tourism Products and Services Information'),
  ('tourism_officer', 'Request for Festivals and Cultural Activities Information'),
  ('tourism_officer', 'Request for Tourist Destination Descriptions and Locations'),
  ('tourism_officer', 'Request for List of Accommodation Establishments Operating in Daet'),
  ('tourism_officer', 'Request for List of Restaurants and Food Establishments'),
  ('tourism_officer', 'Request for Primary and Secondary Tourism Enterprise Classification'),
  ('tourism_officer', 'Request for Number of Registered or Accredited Tourism Establishments'),
  ('tourism_officer', 'Request for Tourism Establishment Classification and Accreditation Status')
on conflict (office_role, document_type) do nothing;
