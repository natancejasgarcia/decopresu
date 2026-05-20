alter table public.budget_validations
add column if not exists project_id uuid references public.projects(id) on delete set null;

create index if not exists budget_validations_project_idx
on public.budget_validations(project_id, created_at desc);
