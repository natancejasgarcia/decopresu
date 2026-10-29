begin;

alter table public.projects add column if not exists budget_vat_rate smallint not null default 21
  check (budget_vat_rate in (10,21));
-- Nullable for existing documents: never rewrite their lines or issued totals.
alter table public.sales_documents add column if not exists default_vat_rate smallint
  check (default_vat_rate in (0,10,21));

create or replace function public.create_sales_document(p_kind text, p_project_id uuid default null, p_source_id uuid default null)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  project public.projects;
  source public.sales_documents;
  result uuid;
  concepts jsonb := '[]'::jsonb;
  rate smallint := 21;
  source_min smallint;
  source_max smallint;
begin
  if auth.uid() is null or not public.is_decoralia_user() then raise exception 'Acceso no autorizado.'; end if;
  if p_kind is null or p_kind not in ('delivery_note','invoice') then raise exception 'Tipo de documento incorrecto.'; end if;
  if p_source_id is not null then
    select * into source from public.sales_documents where id = p_source_id for update;
    if not found or source.kind <> 'delivery_note' or source.status <> 'issued' or p_kind <> 'invoice' then
      raise exception 'Selecciona un albaran emitido.';
    end if;
    select id into result from public.sales_documents where source_document_id = p_source_id and kind = 'invoice';
    if result is not null then return result; end if;
    select min((value->>'vat_rate')::smallint), max((value->>'vat_rate')::smallint)
      into source_min, source_max from jsonb_array_elements(source.lines);
    rate := case when source_min = source_max then source_min else coalesce(source.default_vat_rate,21) end;
    insert into public.sales_documents(kind, project_id, source_document_id, source_label,
      client_name, client_tax_id, client_address, client_email, notes, lines, default_vat_rate, created_by)
      values (p_kind, source.project_id, source.id, source.number, source.client_name, source.client_tax_id,
        source.client_address, source.client_email, source.notes, source.lines, rate, auth.uid()) returning id into result;
  else
    if p_project_id is not null then
      select * into project from public.projects where id = p_project_id for share;
      if not found then raise exception 'La obra ya no esta disponible.'; end if;
      rate := project.budget_vat_rate;
      select coalesce(jsonb_agg(jsonb_build_object('concept', concept, 'notes', coalesce(notes,''),
        'quantity', quantity, 'unit', unit, 'unit_price', unit_price, 'vat_rate', rate)
        order by sort_order, created_at, id),'[]'::jsonb)
        into concepts from public.budget_items where project_id = p_project_id;
    end if;
    insert into public.sales_documents(kind, project_id, source_label, client_name, client_address,
      client_email, lines, default_vat_rate, created_by)
      values (p_kind, p_project_id, coalesce(project.name,''), coalesce(project.client_name,''),
        coalesce(project.address,''), coalesce(project.client_email,''), concepts, rate, auth.uid()) returning id into result;
  end if;
  return result;
end; $$;

revoke execute on function public.create_sales_document(text,uuid,uuid) from public, anon;
grant execute on function public.create_sales_document(text,uuid,uuid) to authenticated;
notify pgrst, 'reload schema';
commit;
