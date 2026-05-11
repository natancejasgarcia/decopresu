create table if not exists public.project_reads (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  last_read_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, user_id)
);

drop trigger if exists set_project_reads_updated_at on public.project_reads;
create trigger set_project_reads_updated_at
before update on public.project_reads
for each row execute function public.set_updated_at();

create index if not exists project_reads_user_project_idx on public.project_reads(user_id, project_id);

alter table public.project_reads enable row level security;

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

insert into public.project_reads (project_id, user_id, last_read_at)
select projects.id, profiles.user_id, now()
from public.projects
cross join public.profiles
on conflict (project_id, user_id) do nothing;
