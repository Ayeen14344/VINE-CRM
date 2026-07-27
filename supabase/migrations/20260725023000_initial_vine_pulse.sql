create extension if not exists pgcrypto;

create type public.portal_role as enum ('super_admin', 'employee', 'client');
create type public.report_status as enum ('draft', 'processing', 'needs_review', 'ready', 'published', 'failed');
create type public.review_decision as enum ('pending', 'valid', 'invalid', 'needs_more_information');

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  primary_email text not null,
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index clients_company_name_key on public.clients (lower(company_name));
create index clients_primary_email_idx on public.clients (lower(primary_email));

create table public.verticals (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  sequence integer not null,
  active boolean not null default true
);

insert into public.verticals (id, key, name, sequence) values
  ('00000000-0000-4000-8000-000000000101', 'sourcing_hiring', 'Sourcing & Hiring', 1),
  ('00000000-0000-4000-8000-000000000102', 'orientation_adp', 'Orientation & ADP Setup', 2),
  ('00000000-0000-4000-8000-000000000103', 'training_scheduling', 'Training, ORE & Work Scheduling', 3),
  ('00000000-0000-4000-8000-000000000104', 'time_attendance', 'Time & Attendance', 4)
on conflict (key) do update set
  name = excluded.name,
  sequence = excluded.sequence,
  active = true;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text not null default '',
  role public.portal_role not null default 'client',
  active boolean not null default true,
  client_id uuid references public.clients(id) on delete set null,
  vertical_id uuid references public.verticals(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_role_idx on public.profiles (role);
create index profiles_client_idx on public.profiles (client_id);
create index profiles_vertical_idx on public.profiles (vertical_id);

create table public.client_memberships (
  user_id uuid not null references public.profiles(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, client_id)
);

create table public.employee_assignments (
  employee_id uuid primary key references public.profiles(id) on delete cascade,
  vertical_id uuid not null references public.verticals(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.employee_client_assignments (
  employee_id uuid not null references public.profiles(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  vertical_id uuid not null references public.verticals(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (employee_id, client_id),
  unique (client_id, vertical_id)
);

create index employee_client_assignments_client_idx
  on public.employee_client_assignments (client_id, vertical_id);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  vertical_id uuid not null references public.verticals(id) on delete restrict,
  report_date date not null,
  status public.report_status not null default 'draft',
  source_filename text not null,
  source_file_path text,
  content_type text,
  file_size bigint,
  extraction_status text not null default 'not_started',
  extraction_summary jsonb not null default '{}'::jsonb,
  version integer not null default 1,
  created_by uuid not null references public.profiles(id) on delete restrict,
  published_by uuid references public.profiles(id) on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, vertical_id, report_date, version)
);

create index reports_dashboard_idx
  on public.reports (client_id, report_date desc, vertical_id, status);

create table public.report_metrics (
  id bigint generated always as identity primary key,
  report_id uuid not null references public.reports(id) on delete cascade,
  metric_key text not null,
  metric_label text not null,
  numeric_value numeric,
  text_value text,
  created_at timestamptz not null default now(),
  unique (report_id, metric_key)
);

create table public.report_rows (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports(id) on delete cascade,
  row_type text not null default 'record',
  person_name text,
  data jsonb not null default '{}'::jsonb,
  source_row integer,
  confidence numeric(5, 4),
  created_at timestamptz not null default now()
);

create index report_rows_report_idx on public.report_rows (report_id);

create table public.time_theft_reviews (
  id uuid primary key default gen_random_uuid(),
  report_row_id uuid not null unique references public.report_rows(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  decision public.review_decision not null default 'pending',
  comment text,
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint review_comment_required check (
    decision not in ('invalid', 'needs_more_information')
    or nullif(trim(comment), '') is not null
  )
);

create index time_theft_reviews_client_idx
  on public.time_theft_reviews (client_id, decision, updated_at desc);

create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_log_entity_idx on public.audit_log (entity_type, entity_id, created_at desc);
create index audit_log_actor_idx on public.audit_log (actor_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger clients_updated_at before update on public.clients
for each row execute function public.set_updated_at();
create trigger profiles_updated_at before update on public.profiles
for each row execute function public.set_updated_at();
create trigger reports_updated_at before update on public.reports
for each row execute function public.set_updated_at();
create trigger reviews_updated_at before update on public.time_theft_reviews
for each row execute function public.set_updated_at();

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_role public.portal_role;
begin
  requested_role := coalesce(
    nullif(new.raw_app_meta_data ->> 'portal_role', '')::public.portal_role,
    'client'::public.portal_role
  );

  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    requested_role
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid())
      and role = 'super_admin'
      and active = true
  );
$$;

create or replace function public.can_access_client(target_client uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_super_admin()
    or exists (
      select 1 from public.client_memberships
      where user_id = (select auth.uid())
        and client_id = target_client
    )
    or exists (
      select 1 from public.employee_client_assignments
      where employee_id = (select auth.uid())
        and client_id = target_client
    );
$$;

create or replace function public.is_employee_assigned(target_client uuid, target_vertical uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_super_admin()
    or exists (
      select 1 from public.employee_client_assignments
      where employee_id = (select auth.uid())
        and client_id = target_client
        and vertical_id = target_vertical
    );
$$;

grant execute on function public.is_super_admin() to authenticated;
grant execute on function public.can_access_client(uuid) to authenticated;
grant execute on function public.is_employee_assigned(uuid, uuid) to authenticated;

alter table public.clients enable row level security;
alter table public.verticals enable row level security;
alter table public.profiles enable row level security;
alter table public.client_memberships enable row level security;
alter table public.employee_assignments enable row level security;
alter table public.employee_client_assignments enable row level security;
alter table public.reports enable row level security;
alter table public.report_metrics enable row level security;
alter table public.report_rows enable row level security;
alter table public.time_theft_reviews enable row level security;
alter table public.audit_log enable row level security;

create policy "Authenticated users can read verticals"
on public.verticals for select to authenticated using (true);

create policy "Users can read their profile and admins can read all"
on public.profiles for select to authenticated
using (id = (select auth.uid()) or public.is_super_admin());
create policy "Admins manage profiles"
on public.profiles for all to authenticated
using (public.is_super_admin()) with check (public.is_super_admin());

create policy "Assigned users can read clients"
on public.clients for select to authenticated
using (public.can_access_client(id));
create policy "Admins manage clients"
on public.clients for all to authenticated
using (public.is_super_admin()) with check (public.is_super_admin());

create policy "Users read their memberships"
on public.client_memberships for select to authenticated
using (user_id = (select auth.uid()) or public.is_super_admin());
create policy "Admins manage memberships"
on public.client_memberships for all to authenticated
using (public.is_super_admin()) with check (public.is_super_admin());

create policy "Employees read their vertical assignment"
on public.employee_assignments for select to authenticated
using (employee_id = (select auth.uid()) or public.is_super_admin());
create policy "Admins manage employee assignments"
on public.employee_assignments for all to authenticated
using (public.is_super_admin()) with check (public.is_super_admin());

create policy "Employees read client assignments"
on public.employee_client_assignments for select to authenticated
using (employee_id = (select auth.uid()) or public.is_super_admin());
create policy "Admins manage employee client assignments"
on public.employee_client_assignments for all to authenticated
using (public.is_super_admin()) with check (public.is_super_admin());

create policy "Authorized users read reports"
on public.reports for select to authenticated
using (public.can_access_client(client_id));
create policy "Assigned employees create reports"
on public.reports for insert to authenticated
with check (
  public.is_employee_assigned(client_id, vertical_id)
  and created_by = (select auth.uid())
);
create policy "Assigned employees update reports"
on public.reports for update to authenticated
using (public.is_employee_assigned(client_id, vertical_id))
with check (public.is_employee_assigned(client_id, vertical_id));
create policy "Admins delete reports"
on public.reports for delete to authenticated
using (public.is_super_admin());

create policy "Authorized users read report metrics"
on public.report_metrics for select to authenticated
using (
  exists (
    select 1 from public.reports
    where reports.id = report_metrics.report_id
      and public.can_access_client(reports.client_id)
  )
);
create policy "Assigned employees manage report metrics"
on public.report_metrics for all to authenticated
using (
  exists (
    select 1 from public.reports
    where reports.id = report_metrics.report_id
      and public.is_employee_assigned(reports.client_id, reports.vertical_id)
  )
)
with check (
  exists (
    select 1 from public.reports
    where reports.id = report_metrics.report_id
      and public.is_employee_assigned(reports.client_id, reports.vertical_id)
  )
);

create policy "Authorized users read report rows"
on public.report_rows for select to authenticated
using (
  exists (
    select 1 from public.reports
    where reports.id = report_rows.report_id
      and public.can_access_client(reports.client_id)
  )
);
create policy "Assigned employees manage report rows"
on public.report_rows for all to authenticated
using (
  exists (
    select 1 from public.reports
    where reports.id = report_rows.report_id
      and public.is_employee_assigned(reports.client_id, reports.vertical_id)
  )
)
with check (
  exists (
    select 1 from public.reports
    where reports.id = report_rows.report_id
      and public.is_employee_assigned(reports.client_id, reports.vertical_id)
  )
);

create policy "Authorized users read time theft reviews"
on public.time_theft_reviews for select to authenticated
using (public.can_access_client(client_id));
create policy "Client members create time theft reviews"
on public.time_theft_reviews for insert to authenticated
with check (
  public.is_super_admin()
  or exists (
    select 1 from public.client_memberships
    where client_memberships.user_id = (select auth.uid())
      and client_memberships.client_id = time_theft_reviews.client_id
  )
);
create policy "Client members update time theft reviews"
on public.time_theft_reviews for update to authenticated
using (
  public.is_super_admin()
  or exists (
    select 1 from public.client_memberships
    where client_memberships.user_id = (select auth.uid())
      and client_memberships.client_id = time_theft_reviews.client_id
  )
)
with check (
  public.is_super_admin()
  or exists (
    select 1 from public.client_memberships
    where client_memberships.user_id = (select auth.uid())
      and client_memberships.client_id = time_theft_reviews.client_id
  )
);

create policy "Users read their own audit events and admins read all"
on public.audit_log for select to authenticated
using (actor_id = (select auth.uid()) or public.is_super_admin());
create policy "Authenticated users create audit events"
on public.audit_log for insert to authenticated
with check (actor_id = (select auth.uid()));

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
) values (
  'client-reports',
  'client-reports',
  false,
  26214400,
  array[
    'text/csv',
    'application/pdf',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/png',
    'image/jpeg'
  ]
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Authorized users download client report files"
on storage.objects for select to authenticated
using (
  bucket_id = 'client-reports'
  and public.can_access_client(((storage.foldername(name))[1])::uuid)
);

create policy "Assigned employees upload client report files"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'client-reports'
  and public.is_employee_assigned(
    ((storage.foldername(name))[1])::uuid,
    ((storage.foldername(name))[2])::uuid
  )
);

create policy "Assigned employees update client report files"
on storage.objects for update to authenticated
using (
  bucket_id = 'client-reports'
  and public.is_employee_assigned(
    ((storage.foldername(name))[1])::uuid,
    ((storage.foldername(name))[2])::uuid
  )
)
with check (
  bucket_id = 'client-reports'
  and public.is_employee_assigned(
    ((storage.foldername(name))[1])::uuid,
    ((storage.foldername(name))[2])::uuid
  )
);

create policy "Admins delete client report files"
on storage.objects for delete to authenticated
using (
  bucket_id = 'client-reports'
  and public.is_super_admin()
);
