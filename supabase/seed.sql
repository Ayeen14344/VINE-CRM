-- Sanitized development-only clients. Do not run seed data in production.
insert into public.clients (id, company_name, primary_email, active) values
  ('10000000-0000-4000-8000-000000000001', 'Northstar Delivery', 'operations@northstar.example.test', true),
  ('10000000-0000-4000-8000-000000000002', 'Evergreen Logistics', 'reports@evergreen.example.test', true),
  ('10000000-0000-4000-8000-000000000003', 'Summit Route Partners', 'admin@summitroute.example.test', true)
on conflict (id) do update set
  company_name = excluded.company_name,
  primary_email = excluded.primary_email,
  active = excluded.active;
