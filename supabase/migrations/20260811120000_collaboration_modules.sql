-- VINE Pulse shared credential vault and client task board.
-- This migration only adds new structures. It does not alter or delete reports.

create table if not exists public.shared_credentials (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  service_name text not null,
  website_url text,
  username text not null,
  password_ciphertext text not null,
  password_iv text not null,
  password_tag text not null,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists shared_credentials_client_idx
  on public.shared_credentials (client_id, lower(service_name));

create table if not exists public.client_tasks (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  vertical_id uuid references public.verticals(id) on delete set null,
  title text not null,
  description text not null default '',
  urgency text not null default 'normal'
    check (urgency in ('low', 'normal', 'high', 'critical')),
  task_status text not null default 'pending'
    check (task_status in ('pending', 'ongoing', 'working', 'done')),
  recurrence text not null default 'one_time'
    check (recurrence in ('one_time', 'daily', 'weekly', 'monthly')),
  due_date date,
  created_by uuid references public.profiles(id) on delete set null,
  created_by_name text not null default '',
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists client_tasks_board_idx
  on public.client_tasks (client_id, task_status, urgency, due_date, created_at desc);

create index if not exists client_tasks_vertical_idx
  on public.client_tasks (client_id, vertical_id, task_status, created_at desc);

create table if not exists public.task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.client_tasks(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  author_name text not null,
  body text not null check (nullif(trim(body), '') is not null),
  created_at timestamptz not null default now()
);

create index if not exists task_comments_task_idx
  on public.task_comments (task_id, created_at);

create table if not exists public.task_attachments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.client_tasks(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  storage_path text not null unique,
  file_name text not null,
  content_type text,
  file_size bigint not null default 0,
  uploaded_by uuid references public.profiles(id) on delete set null,
  uploaded_by_name text not null,
  created_at timestamptz not null default now()
);

create index if not exists task_attachments_task_idx
  on public.task_attachments (task_id, created_at);

drop trigger if exists shared_credentials_updated_at on public.shared_credentials;
create trigger shared_credentials_updated_at before update on public.shared_credentials
for each row execute function public.set_updated_at();

drop trigger if exists client_tasks_updated_at on public.client_tasks;
create trigger client_tasks_updated_at before update on public.client_tasks
for each row execute function public.set_updated_at();

alter table public.shared_credentials enable row level security;
alter table public.client_tasks enable row level security;
alter table public.task_comments enable row level security;
alter table public.task_attachments enable row level security;

-- Vault rows are intentionally accessed only through the authenticated server API.
-- The service-role API performs the client-membership check and decrypts on demand.

drop policy if exists "Authorized users read client tasks" on public.client_tasks;
create policy "Authorized users read client tasks"
on public.client_tasks for select to authenticated
using (public.can_access_client(client_id));

drop policy if exists "Clients and admins create tasks" on public.client_tasks;
create policy "Clients and admins create tasks"
on public.client_tasks for insert to authenticated
with check (
  created_by = (select auth.uid())
  and (
    public.is_super_admin()
    or exists (
      select 1 from public.client_memberships
      where user_id = (select auth.uid())
        and client_id = client_tasks.client_id
    )
  )
);

drop policy if exists "Authorized users update tasks" on public.client_tasks;
create policy "Authorized users update tasks"
on public.client_tasks for update to authenticated
using (public.can_access_client(client_id))
with check (public.can_access_client(client_id));

drop policy if exists "Clients and admins delete tasks" on public.client_tasks;
create policy "Clients and admins delete tasks"
on public.client_tasks for delete to authenticated
using (
  public.is_super_admin()
  or exists (
    select 1 from public.client_memberships
    where user_id = (select auth.uid())
      and client_id = client_tasks.client_id
  )
);

drop policy if exists "Authorized users read task comments" on public.task_comments;
create policy "Authorized users read task comments"
on public.task_comments for select to authenticated
using (public.can_access_client(client_id));

drop policy if exists "Authorized users create task comments" on public.task_comments;
create policy "Authorized users create task comments"
on public.task_comments for insert to authenticated
with check (author_id = (select auth.uid()) and public.can_access_client(client_id));

drop policy if exists "Comment authors and admins delete comments" on public.task_comments;
create policy "Comment authors and admins delete comments"
on public.task_comments for delete to authenticated
using (author_id = (select auth.uid()) or public.is_super_admin());

drop policy if exists "Authorized users read task attachments" on public.task_attachments;
create policy "Authorized users read task attachments"
on public.task_attachments for select to authenticated
using (public.can_access_client(client_id));

drop policy if exists "Authorized users create task attachments" on public.task_attachments;
create policy "Authorized users create task attachments"
on public.task_attachments for insert to authenticated
with check (uploaded_by = (select auth.uid()) and public.can_access_client(client_id));

drop policy if exists "Uploaders and admins delete task attachments" on public.task_attachments;
create policy "Uploaders and admins delete task attachments"
on public.task_attachments for delete to authenticated
using (uploaded_by = (select auth.uid()) or public.is_super_admin());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('task-attachments', 'task-attachments', false, 26214400, null)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = null;

drop policy if exists "Authorized users download task files" on storage.objects;
create policy "Authorized users download task files"
on storage.objects for select to authenticated
using (
  bucket_id = 'task-attachments'
  and public.can_access_client(((storage.foldername(name))[1])::uuid)
);

drop policy if exists "Authorized users upload task files" on storage.objects;
create policy "Authorized users upload task files"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'task-attachments'
  and public.can_access_client(((storage.foldername(name))[1])::uuid)
);

drop policy if exists "Authorized users delete task files" on storage.objects;
create policy "Authorized users delete task files"
on storage.objects for delete to authenticated
using (
  bucket_id = 'task-attachments'
  and public.can_access_client(((storage.foldername(name))[1])::uuid)
);
