alter table public.projects
  add column if not exists is_highlighted boolean not null default false;
