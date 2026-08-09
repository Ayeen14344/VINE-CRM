begin;

alter table public.clients
  add column if not exists enabled_vertical_ids uuid[] not null
  default array[
    '00000000-0000-4000-8000-000000000101'::uuid,
    '00000000-0000-4000-8000-000000000102'::uuid,
    '00000000-0000-4000-8000-000000000103'::uuid,
    '00000000-0000-4000-8000-000000000104'::uuid
  ];

comment on column public.clients.enabled_vertical_ids is
  'Vertical report pages unlocked for client-role users. Super Admins and assigned employees retain operational access.';

create or replace function public.client_has_vertical(target_client uuid, target_vertical uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.clients
    where id = target_client
      and target_vertical = any(enabled_vertical_ids)
  );
$$;

create or replace function public.can_access_client_vertical(target_client uuid, target_vertical uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_super_admin()
    or exists (
      select 1
      from public.employee_client_assignments
      where employee_id = (select auth.uid())
        and client_id = target_client
        and vertical_id = target_vertical
    )
    or (
      public.client_has_vertical(target_client, target_vertical)
      and exists (
        select 1
        from public.client_memberships
        where user_id = (select auth.uid())
          and client_id = target_client
      )
    );
$$;

grant execute on function public.client_has_vertical(uuid, uuid) to authenticated;
grant execute on function public.can_access_client_vertical(uuid, uuid) to authenticated;

drop policy if exists "Authorized users read reports" on public.reports;
create policy "Authorized users read reports"
on public.reports for select to authenticated
using (public.can_access_client_vertical(client_id, vertical_id));

drop policy if exists "Authorized users read report metrics" on public.report_metrics;
create policy "Authorized users read report metrics"
on public.report_metrics for select to authenticated
using (
  exists (
    select 1 from public.reports
    where reports.id = report_metrics.report_id
      and public.can_access_client_vertical(reports.client_id, reports.vertical_id)
  )
);

drop policy if exists "Authorized users read report rows" on public.report_rows;
create policy "Authorized users read report rows"
on public.report_rows for select to authenticated
using (
  exists (
    select 1 from public.reports
    where reports.id = report_rows.report_id
      and public.can_access_client_vertical(reports.client_id, reports.vertical_id)
  )
);

drop policy if exists "Authorized users read time theft reviews" on public.time_theft_reviews;
create policy "Authorized users read time theft reviews"
on public.time_theft_reviews for select to authenticated
using (
  public.can_access_client_vertical(
    client_id,
    '00000000-0000-4000-8000-000000000104'::uuid
  )
);

drop policy if exists "Client members create time theft reviews" on public.time_theft_reviews;
create policy "Client members create time theft reviews"
on public.time_theft_reviews for insert to authenticated
with check (
  public.is_super_admin()
  or (
    public.client_has_vertical(
      client_id,
      '00000000-0000-4000-8000-000000000104'::uuid
    )
    and exists (
      select 1 from public.client_memberships
      where client_memberships.user_id = (select auth.uid())
        and client_memberships.client_id = time_theft_reviews.client_id
    )
  )
);

drop policy if exists "Client members update time theft reviews" on public.time_theft_reviews;
create policy "Client members update time theft reviews"
on public.time_theft_reviews for update to authenticated
using (
  public.is_super_admin()
  or (
    public.client_has_vertical(
      client_id,
      '00000000-0000-4000-8000-000000000104'::uuid
    )
    and exists (
      select 1 from public.client_memberships
      where client_memberships.user_id = (select auth.uid())
        and client_memberships.client_id = time_theft_reviews.client_id
    )
  )
)
with check (
  public.is_super_admin()
  or (
    public.client_has_vertical(
      client_id,
      '00000000-0000-4000-8000-000000000104'::uuid
    )
    and exists (
      select 1 from public.client_memberships
      where client_memberships.user_id = (select auth.uid())
        and client_memberships.client_id = time_theft_reviews.client_id
    )
  )
);

drop policy if exists "Authorized users download client report files" on storage.objects;
create policy "Authorized users download client report files"
on storage.objects for select to authenticated
using (
  bucket_id = 'client-reports'
  and public.can_access_client_vertical(
    ((storage.foldername(name))[1])::uuid,
    ((storage.foldername(name))[2])::uuid
  )
);

commit;
