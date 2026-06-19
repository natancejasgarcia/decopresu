alter table public.daily_notes
add column if not exists project_id uuid references public.projects(id) on delete set null;

create table if not exists public.daily_note_files (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references public.daily_notes(id) on delete cascade,
  uploaded_by uuid references public.profiles(user_id) on delete set null,
  file_name text not null,
  file_url text not null unique,
  file_type text not null,
  created_at timestamptz not null default now()
);

create index if not exists daily_notes_project_date_idx
on public.daily_notes(project_id, note_date desc);

create index if not exists daily_note_files_note_created_idx
on public.daily_note_files(note_id, created_at);

alter table public.daily_note_files enable row level security;

drop policy if exists "daily_note_files_select_authorized" on public.daily_note_files;
create policy "daily_note_files_select_authorized"
on public.daily_note_files for select
to authenticated
using (public.is_decoralia_user());

drop policy if exists "daily_note_files_insert_own" on public.daily_note_files;
create policy "daily_note_files_insert_own"
on public.daily_note_files for insert
to authenticated
with check (public.is_decoralia_user() and uploaded_by = auth.uid());

drop policy if exists "daily_note_files_update_authorized" on public.daily_note_files;
create policy "daily_note_files_update_authorized"
on public.daily_note_files for update
to authenticated
using (public.is_decoralia_user())
with check (public.is_decoralia_user());

drop policy if exists "daily_note_files_delete_authorized" on public.daily_note_files;
create policy "daily_note_files_delete_authorized"
on public.daily_note_files for delete
to authenticated
using (public.is_decoralia_user());

update storage.buckets
set allowed_mime_types = array_append(allowed_mime_types, 'image/gif')
where id = 'project-files'
  and not ('image/gif' = any(allowed_mime_types));
