drop policy if exists "profiles_select_auto_authorized_decoralia" on public.profiles;
create policy "profiles_select_auto_authorized_decoralia"
on public.profiles for select
to authenticated
using (
  user_id = auth.uid()
  and lower(coalesce(auth.jwt() ->> 'email', '')) = 'decoralia1977@gmail.com'
);

drop policy if exists "profiles_insert_auto_authorized_decoralia" on public.profiles;
create policy "profiles_insert_auto_authorized_decoralia"
on public.profiles for insert
to authenticated
with check (
  user_id = auth.uid()
  and lower(coalesce(auth.jwt() ->> 'email', '')) = 'decoralia1977@gmail.com'
  and role = 'admin'
);
