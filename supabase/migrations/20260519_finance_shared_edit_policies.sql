drop policy if exists "project_expenses_all_authorized" on public.project_expenses;
drop policy if exists "project_payments_all_authorized" on public.project_payments;
drop policy if exists "fixed_costs_all_authorized" on public.fixed_costs;

drop policy if exists "project_expenses_select_authorized" on public.project_expenses;
create policy "project_expenses_select_authorized"
on public.project_expenses for select
to authenticated
using (public.is_decoralia_user());

drop policy if exists "project_expenses_insert_authorized" on public.project_expenses;
create policy "project_expenses_insert_authorized"
on public.project_expenses for insert
to authenticated
with check (public.is_decoralia_user() and created_by = auth.uid());

drop policy if exists "project_expenses_update_authorized" on public.project_expenses;
create policy "project_expenses_update_authorized"
on public.project_expenses for update
to authenticated
using (public.is_decoralia_user())
with check (public.is_decoralia_user());

drop policy if exists "project_expenses_delete_authorized" on public.project_expenses;
create policy "project_expenses_delete_authorized"
on public.project_expenses for delete
to authenticated
using (public.is_decoralia_user());

drop policy if exists "project_payments_select_authorized" on public.project_payments;
create policy "project_payments_select_authorized"
on public.project_payments for select
to authenticated
using (public.is_decoralia_user());

drop policy if exists "project_payments_insert_authorized" on public.project_payments;
create policy "project_payments_insert_authorized"
on public.project_payments for insert
to authenticated
with check (public.is_decoralia_user() and created_by = auth.uid());

drop policy if exists "project_payments_update_authorized" on public.project_payments;
create policy "project_payments_update_authorized"
on public.project_payments for update
to authenticated
using (public.is_decoralia_user())
with check (public.is_decoralia_user());

drop policy if exists "project_payments_delete_authorized" on public.project_payments;
create policy "project_payments_delete_authorized"
on public.project_payments for delete
to authenticated
using (public.is_decoralia_user());

drop policy if exists "fixed_costs_select_authorized" on public.fixed_costs;
create policy "fixed_costs_select_authorized"
on public.fixed_costs for select
to authenticated
using (public.is_decoralia_user());

drop policy if exists "fixed_costs_insert_authorized" on public.fixed_costs;
create policy "fixed_costs_insert_authorized"
on public.fixed_costs for insert
to authenticated
with check (public.is_decoralia_user() and created_by = auth.uid());

drop policy if exists "fixed_costs_update_authorized" on public.fixed_costs;
create policy "fixed_costs_update_authorized"
on public.fixed_costs for update
to authenticated
using (public.is_decoralia_user())
with check (public.is_decoralia_user());

drop policy if exists "fixed_costs_delete_authorized" on public.fixed_costs;
create policy "fixed_costs_delete_authorized"
on public.fixed_costs for delete
to authenticated
using (public.is_decoralia_user());
