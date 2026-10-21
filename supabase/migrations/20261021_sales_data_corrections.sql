begin;

-- Fiscal-data corrections are separate documents, never another sale or receipt.
create table if not exists public.sales_data_corrections (
  id uuid primary key default gen_random_uuid(),
  original_document_id uuid not null references public.sales_documents(id) on delete restrict,
  status text not null default 'draft' check (status in ('draft','issued')),
  number text unique,
  correction_date date not null,
  reason text not null check (length(reason) between 1 and 2000),
  client jsonb not null,
  issuer jsonb not null,
  created_by uuid references public.profiles(user_id) on delete set null,
  created_at timestamptz not null default now(),
  issued_at timestamptz,
  check ((status='draft' and number is null and issued_at is null)
    or (status='issued' and number is not null and issued_at is not null))
);
create unique index if not exists sales_data_correction_draft_idx
  on public.sales_data_corrections(original_document_id) where status='draft';
create index if not exists sales_data_correction_original_idx on public.sales_data_corrections(original_document_id, created_at desc);
alter table public.sales_data_corrections enable row level security;
revoke all on public.sales_data_corrections from public, anon, authenticated;
grant select on public.sales_data_corrections to authenticated;
drop policy if exists sales_data_correction_read on public.sales_data_corrections;
create policy sales_data_correction_read on public.sales_data_corrections for select to authenticated using(public.is_decoralia_user());

create or replace function public.guard_sales_data_correction()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  if old.status='issued' then raise exception 'Una rectificativa emitida no puede modificarse.'; end if;
  return new;
end; $$;
drop trigger if exists sales_data_correction_immutable on public.sales_data_corrections;
create trigger sales_data_correction_immutable before update on public.sales_data_corrections for each row execute function public.guard_sales_data_correction();

create or replace function public.save_sales_data_correction(p_original uuid, p_data jsonb)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare doc public.sales_documents; company public.company_settings; result uuid; customer jsonb;
begin
  if not public.is_decoralia_user() then raise exception 'Acceso no autorizado.'; end if;
  select * into doc from public.sales_documents where id=p_original for update;
  if not found or doc.kind<>'invoice' or doc.status<>'issued' then raise exception 'Selecciona una factura emitida.'; end if;
  if nullif(trim(p_data->>'client_name'),'') is null or length(p_data->>'client_name')>200
    or length(coalesce(p_data->>'client_tax_id',''))>30 or length(coalesce(p_data->>'client_address',''))>400
    or length(coalesce(p_data->>'client_city',''))>120 or length(coalesce(p_data->>'client_province',''))>120
    or coalesce(p_data->>'client_postal_code','') !~ '^(|[0-9]{5})$'
    or length(coalesce(p_data->>'client_email',''))>320
    or nullif(trim(p_data->>'reason'),'') is null or length(p_data->>'reason')>2000
    or nullif(p_data->>'correction_date','') is null then raise exception 'Revisa los datos fiscales y el motivo de rectificacion.'; end if;
  if (p_data->>'correction_date')::date < doc.issue_date then raise exception 'La fecha no puede ser anterior a la factura original.'; end if;
  select * into company from public.company_settings where id=1;
  if not found then raise exception 'Completa los datos fiscales de la empresa.'; end if;
  customer := jsonb_build_object(
    'client_name',trim(p_data->>'client_name'), 'client_tax_id',trim(coalesce(p_data->>'client_tax_id','')),
    'client_address',trim(coalesce(p_data->>'client_address','')), 'client_postal_code',trim(coalesce(p_data->>'client_postal_code','')),
    'client_city',trim(coalesce(p_data->>'client_city','')), 'client_province',trim(coalesce(p_data->>'client_province','')),
    'client_email',trim(coalesce(p_data->>'client_email','')));
  select id into result from public.sales_data_corrections where original_document_id=p_original and status='draft' for update;
  if result is null then
    insert into public.sales_data_corrections(original_document_id,correction_date,reason,client,issuer,created_by)
      values(p_original,(p_data->>'correction_date')::date,trim(p_data->>'reason'),customer,to_jsonb(company),auth.uid()) returning id into result;
  else
    update public.sales_data_corrections set correction_date=(p_data->>'correction_date')::date,
      reason=trim(p_data->>'reason'),client=customer,issuer=to_jsonb(company) where id=result;
  end if;
  return result;
end; $$;

create or replace function public.issue_sales_data_correction(p_id uuid)
returns text language plpgsql security definer set search_path=public,pg_temp as $$
declare item public.sales_data_corrections; company public.company_settings; next_number integer; doc_year integer; result text;
begin
  if not public.is_decoralia_user() then raise exception 'Acceso no autorizado.'; end if;
  select * into item from public.sales_data_corrections where id=p_id for update;
  if not found then raise exception 'Rectificativa no encontrada.'; end if;
  if item.status='issued' then return item.number; end if;
  if nullif(trim(item.client->>'client_tax_id'),'') is null or nullif(trim(item.client->>'client_address'),'') is null
    or coalesce(item.client->>'client_postal_code','') !~ '^[0-9]{5}$'
    or nullif(trim(item.client->>'client_city'),'') is null or nullif(trim(item.client->>'client_province'),'') is null
    then raise exception 'Completa NIF, direccion, codigo postal, poblacion y provincia del cliente.'; end if;
  select * into company from public.company_settings where id=1;
  if not found or trim(company.legal_name)='' or trim(company.tax_id)='' or trim(company.address)='' then
    raise exception 'Completa los datos fiscales de la empresa.'; end if;
  doc_year := extract(year from item.correction_date)::integer;
  perform pg_advisory_xact_lock(hashtextextended('invoiceR'||doc_year::text,0));
  if exists(select 1 from public.sales_data_corrections where status='issued' and number like 'R/'||doc_year||'/%' and correction_date>item.correction_date)
    or exists(select 1 from public.sales_documents where status='issued' and number like 'R/'||doc_year||'/%' and issue_date>item.correction_date)
    then raise exception 'Revisa la fecha del ultimo documento de la serie R.'; end if;
  insert into public.sales_sequences(kind,series,year,last_number) values('invoice','R',doc_year,1)
    on conflict(kind,series,year) do update set last_number=public.sales_sequences.last_number+1 returning last_number into next_number;
  result := 'R/'||doc_year||'/'||lpad(next_number::text,greatest(4,length(next_number::text)),'0');
  update public.sales_data_corrections set status='issued',number=result,issuer=to_jsonb(company),issued_at=now() where id=p_id;
  return result;
end; $$;

revoke all on function public.guard_sales_data_correction() from public,anon,authenticated;
revoke all on function public.save_sales_data_correction(uuid,jsonb), public.issue_sales_data_correction(uuid) from public,anon;
grant execute on function public.save_sales_data_correction(uuid,jsonb), public.issue_sales_data_correction(uuid) to authenticated;

commit;
