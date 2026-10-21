begin;

alter table public.sales_documents
  add column if not exists client_postal_code text not null default '',
  add column if not exists client_city text not null default '',
  add column if not exists client_province text not null default '';

-- Only correct the known company setting, never issued invoice snapshots.
update public.company_settings set legal_name = 'DECORALIA ACABADOS, S.L.'
where id = 1 and tax_id = 'B05673124'
  and lower(trim(legal_name)) = 'decoralia pintores';

create or replace function public.save_sales_document(p_id uuid, p_data jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
begin
  if not public.is_decoralia_user() then raise exception 'Acceso no autorizado.'; end if;
  if length(trim(coalesce(p_data->>'client_name',''))) = 0 or length(p_data->>'client_name') > 200
    or length(coalesce(p_data->>'notes','')) > 6000 or jsonb_typeof(p_data->'lines') <> 'array'
    or jsonb_array_length(p_data->'lines') = 0 then raise exception 'Completa el cliente y los conceptos.'; end if;
  update public.sales_documents set client_name = trim(p_data->>'client_name'), client_tax_id = coalesce(p_data->>'client_tax_id',''),
    client_address = coalesce(p_data->>'client_address',''), client_email = coalesce(p_data->>'client_email',''),
    client_postal_code = trim(coalesce(p_data->>'client_postal_code','')),
    client_city = trim(coalesce(p_data->>'client_city','')),
    client_province = trim(coalesce(p_data->>'client_province','')),
    issue_date = (p_data->>'issue_date')::date, due_date = nullif(p_data->>'due_date','')::date,
    notes = coalesce(p_data->>'notes',''), lines = p_data->'lines'
    where id = p_id and status = 'draft';
  if not found then raise exception 'Este documento ya fue emitido o eliminado.'; end if;
  return p_id;
end; $$;

create or replace function public.check_sales_customer_address()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  -- Delivery-note conversion keeps the full client address.
  if tg_op = 'INSERT' and new.source_document_id is not null then
    select client_postal_code, client_city, client_province
      into new.client_postal_code, new.client_city, new.client_province
      from public.sales_documents where id = new.source_document_id;
    new.client_postal_code := coalesce(new.client_postal_code, '');
    new.client_city := coalesce(new.client_city, '');
    new.client_province := coalesce(new.client_province, '');
  end if;
  if length(new.client_postal_code) > 5 or (new.client_postal_code <> '' and new.client_postal_code !~ '^[0-9]{5}$')
    or length(new.client_city) > 120 or length(new.client_province) > 120 then
    raise exception 'Revisa el codigo postal, la poblacion y la provincia del cliente.';
  end if;
  if new.kind = 'invoice' and new.status = 'issued' then
    if tg_op = 'INSERT' or old.status = 'draft' then
      if new.client_postal_code !~ '^[0-9]{5}$' or trim(new.client_city) = '' or trim(new.client_province) = '' then
        raise exception 'Completa el codigo postal, la poblacion y la provincia del cliente antes de emitir la factura.';
      end if;
    end if;
  end if;
  return new;
end; $$;
drop trigger if exists sales_customer_address on public.sales_documents;
create trigger sales_customer_address before insert or update on public.sales_documents
  for each row execute function public.check_sales_customer_address();

revoke all on function public.check_sales_customer_address() from public, anon, authenticated;

commit;
