create table if not exists public.project_expenses (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  category text not null default 'Materiales' check (category in ('Materiales', 'Mano de obra', 'Gasolina', 'Herramientas', 'Subcontrata', 'Otros')),
  supplier text,
  concept text not null,
  amount numeric(10, 2) not null default 0 check (amount >= 0),
  expense_date date not null default current_date,
  is_paid boolean not null default true,
  notes text,
  created_by uuid not null references public.profiles(user_id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.project_payments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  amount numeric(10, 2) not null default 0 check (amount >= 0),
  payment_date date not null default current_date,
  method text not null default 'Transferencia' check (method in ('Transferencia', 'Efectivo', 'Bizum', 'Tarjeta', 'Otro')),
  notes text,
  created_by uuid not null references public.profiles(user_id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.fixed_costs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  amount numeric(10, 2) not null default 0 check (amount >= 0),
  frequency text not null default 'Mensual' check (frequency in ('Mensual', 'Trimestral', 'Anual')),
  next_payment_date date,
  is_active boolean not null default true,
  notes text,
  created_by uuid not null references public.profiles(user_id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists project_expenses_project_date_idx on public.project_expenses(project_id, expense_date desc);
create index if not exists project_expenses_date_idx on public.project_expenses(expense_date desc);
create index if not exists project_payments_project_date_idx on public.project_payments(project_id, payment_date desc);
create index if not exists project_payments_date_idx on public.project_payments(payment_date desc);
create index if not exists fixed_costs_active_date_idx on public.fixed_costs(is_active, next_payment_date);

alter table public.project_expenses enable row level security;
alter table public.project_payments enable row level security;
alter table public.fixed_costs enable row level security;

drop policy if exists "project_expenses_all_authorized" on public.project_expenses;
create policy "project_expenses_all_authorized"
on public.project_expenses for all
to authenticated
using (public.is_decoralia_user())
with check (public.is_decoralia_user() and created_by = auth.uid());

drop policy if exists "project_payments_all_authorized" on public.project_payments;
create policy "project_payments_all_authorized"
on public.project_payments for all
to authenticated
using (public.is_decoralia_user())
with check (public.is_decoralia_user() and created_by = auth.uid());

drop policy if exists "fixed_costs_all_authorized" on public.fixed_costs;
create policy "fixed_costs_all_authorized"
on public.fixed_costs for all
to authenticated
using (public.is_decoralia_user())
with check (public.is_decoralia_user() and created_by = auth.uid());
