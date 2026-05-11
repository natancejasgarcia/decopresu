create table if not exists public.dashboard_dismissals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  item_key text not null,
  dismissed_on date not null default current_date,
  created_at timestamptz not null default now(),
  unique (user_id, item_key, dismissed_on)
);

create index if not exists dashboard_dismissals_user_day_idx on public.dashboard_dismissals(user_id, dismissed_on);

alter table public.dashboard_dismissals enable row level security;

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
