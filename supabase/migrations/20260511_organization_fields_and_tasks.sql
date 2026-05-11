alter table public.projects
add column if not exists priority_tag text not null default 'Normal';

alter table public.projects
add column if not exists next_step text;

alter table public.projects
add column if not exists visit_date date;

alter table public.projects
add column if not exists start_date date;

alter table public.projects
add column if not exists end_date date;

alter table public.projects
drop constraint if exists projects_priority_tag_check;

alter table public.projects
add constraint projects_priority_tag_check
check (priority_tag in ('Normal', 'Urgente', 'Esperando cliente', 'Falta medir', 'Falta presupuesto', 'Material pedido', 'Listo para empezar'));

create table if not exists public.project_tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null,
  is_done boolean not null default false,
  due_date date,
  created_by uuid references public.profiles(user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_project_tasks_updated_at on public.project_tasks;
create trigger set_project_tasks_updated_at
before update on public.project_tasks
for each row execute function public.set_updated_at();

create index if not exists project_tasks_project_done_idx on public.project_tasks(project_id, is_done, due_date);

alter table public.project_tasks enable row level security;

drop policy if exists "project_tasks_all_authorized" on public.project_tasks;
create policy "project_tasks_all_authorized"
on public.project_tasks for all
to authenticated
using (public.is_decoralia_user())
with check (public.is_decoralia_user());
