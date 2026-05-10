alter table public.projects
add column if not exists project_type text not null default 'Pintura';

alter table public.projects
drop constraint if exists projects_project_type_check;

alter table public.projects
add constraint projects_project_type_check
check (project_type in ('Pintura', 'Laca'));

update public.projects
set project_type = 'Pintura'
where project_type is null;

create index if not exists projects_project_type_idx on public.projects(project_type);
