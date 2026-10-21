begin;
-- Visibility only: never change an issued document, its sequence or its payments.
create table if not exists public.sales_document_trash (
  document_id uuid primary key references public.sales_documents(id) on delete cascade,
  trashed_at timestamptz not null default now(),
  trashed_by uuid references public.profiles(user_id) on delete set null
);
alter table public.sales_document_trash enable row level security;
revoke all on public.sales_document_trash from public,anon,authenticated;
grant select on public.sales_document_trash to authenticated;
drop policy if exists sales_document_trash_read on public.sales_document_trash;
create policy sales_document_trash_read on public.sales_document_trash for select to authenticated using(public.is_decoralia_user());
create or replace function public.set_sales_document_trashed(p_id uuid,p_trashed boolean)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not public.is_decoralia_user() then raise exception 'Acceso no autorizado.'; end if;
  if p_trashed is null then raise exception 'Selecciona una accion valida.'; end if;
  perform id from public.sales_documents where id=p_id for update;
  if not found then raise exception 'Documento no encontrado.'; end if;
  if p_trashed then
    insert into public.sales_document_trash(document_id,trashed_by) values(p_id,auth.uid()) on conflict(document_id) do nothing;
  else
    delete from public.sales_document_trash where document_id=p_id;
  end if;
end; $$;
revoke all on function public.set_sales_document_trashed(uuid,boolean) from public,anon;
grant execute on function public.set_sales_document_trashed(uuid,boolean) to authenticated;
commit;
