create table if not exists public.budget_validations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  file_name text not null,
  file_url text not null unique,
  file_type text not null default 'application/pdf',
  is_validated boolean not null default false,
  created_by uuid not null references public.profiles(user_id) on delete cascade,
  validated_by uuid references public.profiles(user_id) on delete set null,
  created_at timestamptz not null default now(),
  validated_at timestamptz
);

create index if not exists budget_validations_created_at_idx
on public.budget_validations(created_at desc);

create index if not exists budget_validations_status_idx
on public.budget_validations(is_validated, created_at desc);

alter table public.budget_validations enable row level security;

drop policy if exists "budget_validations_select_authorized" on public.budget_validations;
create policy "budget_validations_select_authorized"
on public.budget_validations for select
to authenticated
using (public.is_decoralia_user());

drop policy if exists "budget_validations_insert_authorized" on public.budget_validations;
create policy "budget_validations_insert_authorized"
on public.budget_validations for insert
to authenticated
with check (public.is_decoralia_user() and created_by = auth.uid());

drop policy if exists "budget_validations_update_authorized" on public.budget_validations;
create policy "budget_validations_update_authorized"
on public.budget_validations for update
to authenticated
using (public.is_decoralia_user())
with check (public.is_decoralia_user());

drop policy if exists "budget_validations_delete_authorized" on public.budget_validations;
create policy "budget_validations_delete_authorized"
on public.budget_validations for delete
to authenticated
using (public.is_decoralia_user());
