-- Route VINE Tasks to a named support vertical without changing existing tasks.

alter table public.client_tasks
  add column if not exists vertical_id uuid references public.verticals(id) on delete set null;

create index if not exists client_tasks_vertical_idx
  on public.client_tasks (client_id, vertical_id, task_status, created_at desc);

drop policy if exists "Authorized users read client tasks" on public.client_tasks;
create policy "Authorized users read client tasks"
on public.client_tasks for select to authenticated
using (
  (vertical_id is null and public.can_access_client(client_id))
  or public.can_access_client_vertical(client_id, vertical_id)
);

drop policy if exists "Authorized users update tasks" on public.client_tasks;
create policy "Authorized users update tasks"
on public.client_tasks for update to authenticated
using (
  (vertical_id is null and public.can_access_client(client_id))
  or public.can_access_client_vertical(client_id, vertical_id)
)
with check (
  (vertical_id is null and public.can_access_client(client_id))
  or public.can_access_client_vertical(client_id, vertical_id)
);

drop policy if exists "Clients and admins create tasks" on public.client_tasks;
create policy "Clients and admins create tasks"
on public.client_tasks for insert to authenticated
with check (
  created_by = (select auth.uid())
  and vertical_id is not null
  and public.can_access_client_vertical(client_id, vertical_id)
  and exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and role in ('super_admin', 'client')
  )
);
