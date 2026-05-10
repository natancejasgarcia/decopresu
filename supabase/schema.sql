create extension if not exists "pgcrypto";

do $$
begin
  if not exists (select 1 from pg_type where typname = 'project_status') then
    create type public.project_status as enum (
      'Pendiente',
      'Presupuestado',
      'Aprobado',
      'En ejecución',
      'Terminado',
      'Cobrado'
    );
  end if;
end $$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  name text not null,
  role text not null default 'member' check (role in ('admin', 'member')),
  created_at timestamptz not null default now()
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  client_name text not null,
  client_phone text not null,
  client_email text,
  address text not null,
  description text not null,
  status public.project_status not null default 'Pendiente',
  internal_notes text,
  created_by uuid references public.profiles(user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  text text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.project_files (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  uploaded_by uuid not null references public.profiles(user_id) on delete cascade,
  file_name text not null,
  file_url text not null,
  file_type text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  length numeric(10, 2) not null check (length >= 0),
  width numeric(10, 2) not null check (width >= 0),
  height numeric(10, 2) not null check (height >= 0),
  ceiling_area numeric(10, 2) generated always as (round(length * width, 2)) stored,
  wall_area numeric(10, 2) generated always as (round(2 * (length + width) * height, 2)) stored,
  openings_area numeric(10, 2) not null default 0 check (openings_area >= 0),
  manual_area numeric(10, 2) not null default 0 check (manual_area >= 0),
  paint_scope text not null default 'walls_and_ceiling' check (paint_scope in ('walls_and_ceiling', 'ceiling_only', 'walls_only', 'manual_area')),
  unit_price numeric(10, 2) not null default 6 check (unit_price >= 0),
  total_paintable_area numeric(10, 2) generated always as (
    case
      when paint_scope = 'manual_area' then manual_area
      when paint_scope = 'ceiling_only' then round(length * width, 2)
      when paint_scope = 'walls_only' then greatest(round((2 * (length + width) * height) - openings_area, 2), 0)
      else greatest(round((length * width) + (2 * (length + width) * height) - openings_area, 2), 0)
    end
  ) stored,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.budget_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  concept text not null,
  notes text,
  quantity numeric(10, 2) not null check (quantity > 0),
  unit text not null,
  unit_price numeric(10, 2) not null default 0 check (unit_price >= 0),
  total numeric(10, 2) generated always as (round(quantity * unit_price, 2)) stored,
  created_at timestamptz not null default now()
);

drop trigger if exists set_projects_updated_at on public.projects;
create trigger set_projects_updated_at
before update on public.projects
for each row execute function public.set_updated_at();

create index if not exists profiles_user_id_idx on public.profiles(user_id);
create index if not exists projects_created_at_idx on public.projects(created_at desc);
create index if not exists projects_status_idx on public.projects(status);
create index if not exists projects_last_activity_at_idx on public.projects(last_activity_at desc);
create index if not exists messages_project_id_created_at_idx on public.messages(project_id, created_at);
create index if not exists project_files_project_id_created_at_idx on public.project_files(project_id, created_at desc);
create index if not exists rooms_project_id_created_at_idx on public.rooms(project_id, created_at desc);
create index if not exists budget_items_project_id_created_at_idx on public.budget_items(project_id, created_at);

alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.messages enable row level security;
alter table public.project_files enable row level security;
alter table public.rooms enable row level security;
alter table public.budget_items enable row level security;

create or replace function public.is_decoralia_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where user_id = auth.uid()
  );
$$;

drop policy if exists "profiles_select_authorized" on public.profiles;
create policy "profiles_select_authorized"
on public.profiles for select
to authenticated
using (public.is_decoralia_user());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "projects_all_authorized" on public.projects;
create policy "projects_all_authorized"
on public.projects for all
to authenticated
using (public.is_decoralia_user())
with check (public.is_decoralia_user());

drop policy if exists "messages_all_authorized" on public.messages;
create policy "messages_all_authorized"
on public.messages for all
to authenticated
using (public.is_decoralia_user())
with check (public.is_decoralia_user() and user_id = auth.uid());

drop policy if exists "project_files_all_authorized" on public.project_files;
create policy "project_files_all_authorized"
on public.project_files for all
to authenticated
using (public.is_decoralia_user())
with check (public.is_decoralia_user() and uploaded_by = auth.uid());

drop policy if exists "rooms_all_authorized" on public.rooms;
create policy "rooms_all_authorized"
on public.rooms for all
to authenticated
using (public.is_decoralia_user())
with check (public.is_decoralia_user());

drop policy if exists "budget_items_all_authorized" on public.budget_items;
create policy "budget_items_all_authorized"
on public.budget_items for all
to authenticated
using (public.is_decoralia_user())
with check (public.is_decoralia_user());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'project-files',
  'project-files',
  false,
  15728640,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain'
  ]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "storage_project_files_select_authorized" on storage.objects;
create policy "storage_project_files_select_authorized"
on storage.objects for select
to authenticated
using (bucket_id = 'project-files' and public.is_decoralia_user());

drop policy if exists "storage_project_files_insert_authorized" on storage.objects;
create policy "storage_project_files_insert_authorized"
on storage.objects for insert
to authenticated
with check (bucket_id = 'project-files' and public.is_decoralia_user());

drop policy if exists "storage_project_files_update_authorized" on storage.objects;
create policy "storage_project_files_update_authorized"
on storage.objects for update
to authenticated
using (bucket_id = 'project-files' and public.is_decoralia_user())
with check (bucket_id = 'project-files' and public.is_decoralia_user());

drop policy if exists "storage_project_files_delete_authorized" on storage.objects;
create policy "storage_project_files_delete_authorized"
on storage.objects for delete
to authenticated
using (bucket_id = 'project-files' and public.is_decoralia_user());

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.messages;
  end if;
exception
  when duplicate_object then null;
end $$;

-- Crea primero los usuarios en Supabase Auth y sustituye estos UUID por sus ids reales:
-- insert into public.profiles (user_id, name, role) values
--   ('00000000-0000-0000-0000-000000000001', 'José Antonio', 'admin'),
--   ('00000000-0000-0000-0000-000000000002', 'Padre', 'member');
