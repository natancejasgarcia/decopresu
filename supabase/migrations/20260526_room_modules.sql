create table if not exists public.room_modules (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete cascade,
  module_type text not null default 'free' check (module_type in ('ceiling_only', 'walls_only', 'manual_area', 'free')),
  concept text not null,
  quantity numeric(10, 2) not null check (quantity > 0),
  unit text not null default 'm2',
  unit_price numeric(10, 2) not null default 0 check (unit_price >= 0),
  total numeric(10, 2) generated always as (round(quantity * unit_price, 2)) stored,
  notes text,
  created_by uuid not null references public.profiles(user_id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists room_modules_project_room_idx on public.room_modules(project_id, room_id, created_at);
create index if not exists room_modules_project_created_at_idx on public.room_modules(project_id, created_at);

alter table public.room_modules enable row level security;

drop policy if exists "room_modules_all_authorized" on public.room_modules;
create policy "room_modules_all_authorized"
on public.room_modules for all
to authenticated
using (public.is_decoralia_user())
with check (public.is_decoralia_user());
