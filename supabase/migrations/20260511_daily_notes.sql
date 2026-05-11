create table if not exists public.daily_notes (
  id uuid primary key default gen_random_uuid(),
  text text not null,
  note_date date not null default current_date,
  created_by uuid not null references public.profiles(user_id) on delete cascade,
  is_done boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_daily_notes_updated_at on public.daily_notes;
create trigger set_daily_notes_updated_at
before update on public.daily_notes
for each row execute function public.set_updated_at();

create index if not exists daily_notes_date_done_idx
on public.daily_notes(note_date desc, is_done, created_at desc);

alter table public.daily_notes enable row level security;

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
