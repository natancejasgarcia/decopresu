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
  project_type text not null default 'Pintura' check (project_type in ('Pintura', 'Laca')),
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

create table if not exists public.project_reads (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  last_read_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, user_id)
);

create table if not exists public.dashboard_dismissals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  item_key text not null,
  dismissed_on date not null default current_date,
  created_at timestamptz not null default now(),
  unique (user_id, item_key, dismissed_on)
);

create table if not exists public.daily_notes (
  id uuid primary key default gen_random_uuid(),
  text text not null,
  note_date date not null default current_date,
  created_by uuid not null references public.profiles(user_id) on delete cascade,
  is_done boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
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
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.project_expenses (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  category text not null default 'Materiales' check (category in ('Materiales', 'Mano de obra', 'Gasolina', 'Herramientas', 'Subcontrata', 'Otros')),
  supplier text,
  concept text not null,
  amount numeric(10, 2) not null default 0 check (amount >= 0),
  expense_date date not null default current_date,
  is_paid boolean not null default true,
  notes text,
  created_by uuid not null references public.profiles(user_id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.project_payments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  amount numeric(10, 2) not null default 0 check (amount >= 0),
  payment_date date not null default current_date,
  method text not null default 'Transferencia' check (method in ('Transferencia', 'Efectivo', 'Bizum', 'Tarjeta', 'Otro')),
  notes text,
  created_by uuid not null references public.profiles(user_id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.fixed_costs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  amount numeric(10, 2) not null default 0 check (amount >= 0),
  frequency text not null default 'Mensual' check (frequency in ('Mensual', 'Trimestral', 'Anual')),
  next_payment_date date,
  is_active boolean not null default true,
  notes text,
  created_by uuid not null references public.profiles(user_id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.sent_emails (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete set null,
  to_email text not null,
  subject text not null,
  body text not null,
  status text not null default 'sent' check (status in ('sent', 'failed')),
  error_message text,
  sent_by uuid not null references public.profiles(user_id) on delete cascade,
  created_at timestamptz not null default now()
);

drop trigger if exists set_projects_updated_at on public.projects;
create trigger set_projects_updated_at
before update on public.projects
for each row execute function public.set_updated_at();

drop trigger if exists set_project_reads_updated_at on public.project_reads;
create trigger set_project_reads_updated_at
before update on public.project_reads
for each row execute function public.set_updated_at();

drop trigger if exists set_daily_notes_updated_at on public.daily_notes;
create trigger set_daily_notes_updated_at
before update on public.daily_notes
for each row execute function public.set_updated_at();

create index if not exists profiles_user_id_idx on public.profiles(user_id);
create index if not exists projects_created_at_idx on public.projects(created_at desc);
create index if not exists projects_status_idx on public.projects(status);
create index if not exists projects_project_type_idx on public.projects(project_type);
create index if not exists projects_last_activity_at_idx on public.projects(last_activity_at desc);
create index if not exists messages_project_id_created_at_idx on public.messages(project_id, created_at);
create index if not exists project_reads_user_project_idx on public.project_reads(user_id, project_id);
create index if not exists dashboard_dismissals_user_day_idx on public.dashboard_dismissals(user_id, dismissed_on);
create index if not exists daily_notes_date_done_idx on public.daily_notes(note_date desc, is_done, created_at desc);
create index if not exists project_files_project_id_created_at_idx on public.project_files(project_id, created_at desc);
create index if not exists rooms_project_id_created_at_idx on public.rooms(project_id, created_at desc);
create index if not exists budget_items_project_id_created_at_idx on public.budget_items(project_id, created_at);
create index if not exists budget_items_project_sort_order_idx on public.budget_items(project_id, sort_order, created_at);
create index if not exists project_expenses_project_date_idx on public.project_expenses(project_id, expense_date desc);
create index if not exists project_expenses_date_idx on public.project_expenses(expense_date desc);
create index if not exists project_payments_project_date_idx on public.project_payments(project_id, payment_date desc);
create index if not exists project_payments_date_idx on public.project_payments(payment_date desc);
create index if not exists fixed_costs_active_date_idx on public.fixed_costs(is_active, next_payment_date);
create index if not exists sent_emails_created_at_idx on public.sent_emails(created_at desc);
create index if not exists sent_emails_project_idx on public.sent_emails(project_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.messages enable row level security;
alter table public.project_reads enable row level security;
alter table public.dashboard_dismissals enable row level security;
alter table public.daily_notes enable row level security;
alter table public.project_files enable row level security;
alter table public.rooms enable row level security;
alter table public.budget_items enable row level security;
alter table public.project_expenses enable row level security;
alter table public.project_payments enable row level security;
alter table public.fixed_costs enable row level security;
alter table public.sent_emails enable row level security;

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

drop policy if exists "project_reads_select_authorized" on public.project_reads;
create policy "project_reads_select_authorized"
on public.project_reads for select
to authenticated
using (public.is_decoralia_user());

drop policy if exists "project_reads_insert_own" on public.project_reads;
create policy "project_reads_insert_own"
on public.project_reads for insert
to authenticated
with check (public.is_decoralia_user() and user_id = auth.uid());

drop policy if exists "project_reads_update_own" on public.project_reads;
create policy "project_reads_update_own"
on public.project_reads for update
to authenticated
using (public.is_decoralia_user() and user_id = auth.uid())
with check (public.is_decoralia_user() and user_id = auth.uid());

drop policy if exists "dashboard_dismissals_select_own" on public.dashboard_dismissals;
create policy "dashboard_dismissals_select_own"
on public.dashboard_dismissals for select
to authenticated
using (public.is_decoralia_user() and user_id = auth.uid());

drop policy if exists "dashboard_dismissals_insert_own" on public.dashboard_dismissals;
create policy "dashboard_dismissals_insert_own"
on public.dashboard_dismissals for insert
to authenticated
with check (public.is_decoralia_user() and user_id = auth.uid());

drop policy if exists "daily_notes_select_authorized" on public.daily_notes;
create policy "daily_notes_select_authorized"
on public.daily_notes for select
to authenticated
using (public.is_decoralia_user());

drop policy if exists "daily_notes_insert_own" on public.daily_notes;
create policy "daily_notes_insert_own"
on public.daily_notes for insert
to authenticated
with check (public.is_decoralia_user() and created_by = auth.uid());

drop policy if exists "daily_notes_update_authorized" on public.daily_notes;
create policy "daily_notes_update_authorized"
on public.daily_notes for update
to authenticated
using (public.is_decoralia_user())
with check (public.is_decoralia_user());

drop policy if exists "daily_notes_delete_authorized" on public.daily_notes;
create policy "daily_notes_delete_authorized"
on public.daily_notes for delete
to authenticated
using (public.is_decoralia_user());

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

drop policy if exists "project_expenses_all_authorized" on public.project_expenses;
create policy "project_expenses_all_authorized"
on public.project_expenses for all
to authenticated
using (public.is_decoralia_user())
with check (public.is_decoralia_user() and created_by = auth.uid());

drop policy if exists "project_payments_all_authorized" on public.project_payments;
create policy "project_payments_all_authorized"
on public.project_payments for all
to authenticated
using (public.is_decoralia_user())
with check (public.is_decoralia_user() and created_by = auth.uid());

drop policy if exists "fixed_costs_all_authorized" on public.fixed_costs;
create policy "fixed_costs_all_authorized"
on public.fixed_costs for all
to authenticated
using (public.is_decoralia_user())
with check (public.is_decoralia_user() and created_by = auth.uid());

drop policy if exists "sent_emails_all_authorized" on public.sent_emails;
create policy "sent_emails_all_authorized"
on public.sent_emails for all
to authenticated
using (public.is_decoralia_user())
with check (public.is_decoralia_user() and sent_by = auth.uid());

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
