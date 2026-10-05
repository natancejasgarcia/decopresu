-- Apply after schema.sql. Existing projects, budgets and payments are preserved.
begin;

create table if not exists public.company_settings (
  id smallint primary key default 1 check (id = 1),
  legal_name text not null default 'Decoralia Pintores', tax_id text not null default '',
  address text not null default '', email text not null default '', phone text not null default '', iban text not null default '',
  invoice_series text not null default 'F' check (invoice_series ~ '^[A-Z0-9]{1,8}$'),
  delivery_series text not null default 'A' check (delivery_series ~ '^[A-Z0-9]{1,8}$')
);
insert into public.company_settings(id) values (1) on conflict do nothing;

create table if not exists public.sales_documents (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('delivery_note', 'invoice')),
  status text not null default 'draft' check (status in ('draft', 'issued')),
  number text unique,
  project_id uuid references public.projects(id) on delete restrict,
  source_document_id uuid references public.sales_documents(id) on delete restrict,
  source_label text not null default '',
  client_name text not null default '', client_tax_id text not null default '',
  client_address text not null default '', client_email text not null default '',
  issue_date date not null default current_date, due_date date,
  notes text not null default '', lines jsonb not null default '[]'::jsonb check (jsonb_typeof(lines) = 'array'),
  subtotal numeric(16,2) not null default 0, tax_total numeric(16,2) not null default 0, total numeric(16,2) not null default 0,
  issuer jsonb,
  created_by uuid references public.profiles(user_id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), issued_at timestamptz,
  check ((status = 'draft' and number is null and issued_at is null) or (status = 'issued' and number is not null and issued_at is not null)),
  check (due_date is null or due_date >= issue_date)
);
create index if not exists sales_documents_project_idx on public.sales_documents(project_id, created_at desc);
create index if not exists sales_documents_kind_date_idx on public.sales_documents(kind, issue_date desc);
create unique index if not exists sales_documents_source_invoice_idx on public.sales_documents(source_document_id) where kind = 'invoice' and source_document_id is not null;

create table if not exists public.sales_sequences (
  kind text not null, series text not null, year integer not null, last_number integer not null,
  primary key (kind, series, year)
);
alter table public.project_payments add column if not exists sales_document_id uuid references public.sales_documents(id) on delete restrict;
create index if not exists project_payments_document_idx on public.project_payments(sales_document_id);

alter table public.company_settings enable row level security;
alter table public.sales_documents enable row level security;
alter table public.sales_sequences enable row level security;
drop policy if exists company_settings_team on public.company_settings;
create policy company_settings_team on public.company_settings for all to authenticated
  using (public.is_decoralia_user()) with check (public.is_decoralia_user());
drop policy if exists sales_documents_team_read on public.sales_documents;
create policy sales_documents_team_read on public.sales_documents for select to authenticated using (public.is_decoralia_user());
revoke all on public.sales_documents, public.sales_sequences from anon, authenticated;
grant select on public.sales_documents to authenticated;
grant select, insert, update on public.company_settings to authenticated;

create or replace function public.validate_sales_document()
returns trigger language plpgsql set search_path = public as $$
declare line jsonb; base numeric; tax numeric; qty numeric; price numeric; rate numeric;
begin
  if tg_op = 'UPDATE' and old.status = 'issued' then
    raise exception 'Un documento emitido no puede modificarse.';
  end if;
  if jsonb_array_length(new.lines) > 150 then raise exception 'Demasiados conceptos.'; end if;
  new.subtotal := 0; new.tax_total := 0;
  for line in select value from jsonb_array_elements(new.lines) loop
    qty := (line->>'quantity')::numeric; price := (line->>'unit_price')::numeric; rate := (line->>'vat_rate')::numeric;
    if qty is null or price is null or rate is null or qty <= 0 or qty > 9999999 or price < 0 or price > 9999999 or rate not in (0,10,21)
      or length(trim(coalesce(line->>'concept',''))) = 0 or length(line->>'concept') > 200
      or length(coalesce(line->>'notes','')) > 4000 or length(coalesce(line->>'unit','')) > 20
    then raise exception 'Revisa los conceptos, cantidades y precios.'; end if;
    base := round(qty * price, 2); tax := round(base * rate / 100, 2);
    new.subtotal := new.subtotal + base; new.tax_total := new.tax_total + tax;
  end loop;
  new.total := new.subtotal + new.tax_total; new.updated_at := now();
  return new;
end; $$;
drop trigger if exists sales_document_validation on public.sales_documents;
create trigger sales_document_validation before insert or update on public.sales_documents for each row execute function public.validate_sales_document();

create or replace function public.create_sales_document(p_kind text, p_project_id uuid default null, p_source_id uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare project public.projects; source public.sales_documents; result uuid; concepts jsonb := '[]'::jsonb;
begin
  if not public.is_decoralia_user() then raise exception 'Acceso no autorizado.'; end if;
  if p_kind not in ('delivery_note','invoice') then raise exception 'Tipo de documento incorrecto.'; end if;
  if p_source_id is not null then
    select * into source from public.sales_documents where id = p_source_id for update;
    if not found or source.kind <> 'delivery_note' or source.status <> 'issued' or p_kind <> 'invoice' then raise exception 'Selecciona un albarán emitido.'; end if;
    select id into result from public.sales_documents where source_document_id = p_source_id and kind = 'invoice';
    if result is not null then return result; end if;
    insert into public.sales_documents(kind, project_id, source_document_id, source_label, client_name, client_tax_id, client_address, client_email, notes, lines, created_by)
      values (p_kind, source.project_id, source.id, source.number, source.client_name, source.client_tax_id, source.client_address, source.client_email, source.notes, source.lines, auth.uid()) returning id into result;
  else
    if p_project_id is not null then
      select * into project from public.projects where id = p_project_id;
      if not found then raise exception 'La obra ya no está disponible.'; end if;
      select coalesce(jsonb_agg(jsonb_build_object('concept', concept, 'notes', coalesce(notes,''), 'quantity', quantity, 'unit', unit, 'unit_price', unit_price, 'vat_rate', 21) order by sort_order, created_at, id),'[]'::jsonb)
        into concepts from public.budget_items where project_id = p_project_id;
    end if;
    insert into public.sales_documents(kind, project_id, source_label, client_name, client_address, client_email, lines, created_by)
      values (p_kind, p_project_id, coalesce(project.name,''), coalesce(project.client_name,''), coalesce(project.address,''), coalesce(project.client_email,''), concepts, auth.uid()) returning id into result;
  end if;
  return result;
end; $$;

create or replace function public.save_sales_document(p_id uuid, p_data jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
begin
  if not public.is_decoralia_user() then raise exception 'Acceso no autorizado.'; end if;
  if length(trim(coalesce(p_data->>'client_name',''))) = 0 or length(p_data->>'client_name') > 200
    or length(coalesce(p_data->>'notes','')) > 6000 or jsonb_typeof(p_data->'lines') <> 'array'
    or jsonb_array_length(p_data->'lines') = 0 then raise exception 'Completa el cliente y los conceptos.'; end if;
  update public.sales_documents set client_name = trim(p_data->>'client_name'), client_tax_id = coalesce(p_data->>'client_tax_id',''),
    client_address = coalesce(p_data->>'client_address',''), client_email = coalesce(p_data->>'client_email',''),
    issue_date = (p_data->>'issue_date')::date, due_date = nullif(p_data->>'due_date','')::date,
    notes = coalesce(p_data->>'notes',''), lines = p_data->'lines'
    where id = p_id and status = 'draft';
  if not found then raise exception 'Este documento ya fue emitido o eliminado.'; end if;
  return p_id;
end; $$;

create or replace function public.issue_sales_document(p_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare doc public.sales_documents; company public.company_settings; v_series text; next_number integer; doc_year integer; result text;
begin
  if not public.is_decoralia_user() then raise exception 'Acceso no autorizado.'; end if;
  select * into doc from public.sales_documents where id = p_id for update;
  if not found then raise exception 'Documento no encontrado.'; end if;
  if doc.status = 'issued' then return doc.number; end if;
  select * into company from public.company_settings where id = 1;
  if not found or trim(company.legal_name) = '' or trim(company.address) = '' or trim(company.tax_id) = '' then raise exception 'Completa primero los datos fiscales de tu empresa en Ajustes.'; end if;
  if trim(doc.client_name) = '' or jsonb_array_length(doc.lines) = 0 then raise exception 'Completa el cliente y los conceptos.'; end if;
  if doc.kind = 'invoice' and (trim(doc.client_tax_id) = '' or trim(doc.client_address) = '') then raise exception 'La factura necesita NIF y dirección fiscal del cliente.'; end if;
  v_series := case when doc.kind = 'invoice' then company.invoice_series else company.delivery_series end;
  doc_year := extract(year from doc.issue_date)::integer;
  perform pg_advisory_xact_lock(hashtextextended(doc.kind || v_series || doc_year::text, 0));
  if exists(select 1 from public.sales_documents where kind = doc.kind and status = 'issued' and number like v_series || '/' || doc_year || '/%' and issue_date > doc.issue_date) then
    raise exception 'La fecha no puede ser anterior al último documento emitido de esta serie.';
  end if;
  insert into public.sales_sequences(kind, series, year, last_number) values (doc.kind, v_series, doc_year, 1)
    on conflict (kind, series, year) do update set last_number = public.sales_sequences.last_number + 1 returning last_number into next_number;
  result := v_series || '/' || doc_year || '/' || lpad(next_number::text, greatest(4,length(next_number::text)), '0');
  update public.sales_documents set status = 'issued', number = result, issuer = to_jsonb(company), issued_at = now() where id = p_id;
  return result;
end; $$;

create or replace function public.delete_sales_draft(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_decoralia_user() then raise exception 'Acceso no autorizado.'; end if;
  delete from public.sales_documents where id = p_id and status = 'draft';
  if not found then raise exception 'Solo puedes borrar documentos en borrador.'; end if;
end; $$;

-- Existing finance forms may edit receipts; keep their invoice association consistent.
create or replace function public.guard_sales_payment()
returns trigger language plpgsql security definer set search_path = public as $$
declare doc public.sales_documents; paid numeric;
begin
  if tg_op = 'UPDATE' and old.sales_document_id is not null and new.sales_document_id is distinct from old.sales_document_id then
    raise exception 'No puedes desvincular un cobro de su factura.';
  end if;
  if new.sales_document_id is null then return new; end if;
  select * into doc from public.sales_documents where id = new.sales_document_id for update;
  if not found or doc.kind <> 'invoice' or doc.status <> 'issued' or new.project_id is distinct from doc.project_id then
    raise exception 'El cobro debe estar asociado a la misma obra que la factura emitida.';
  end if;
  select coalesce(sum(amount),0) into paid from public.project_payments where sales_document_id = doc.id and id <> new.id;
  if new.amount <= 0 or paid + new.amount > doc.total or new.payment_date < doc.issue_date then
    raise exception 'Revisa el importe pendiente y la fecha de la factura.';
  end if;
  return new;
end; $$;
drop trigger if exists project_payment_sales_guard on public.project_payments;
create trigger project_payment_sales_guard before insert or update on public.project_payments for each row execute function public.guard_sales_payment();

create or replace function public.record_sales_payment(p_id uuid, p_amount numeric, p_date date, p_method text)
returns uuid language plpgsql security definer set search_path = public as $$
declare doc public.sales_documents; paid numeric; result uuid;
begin
  if not public.is_decoralia_user() then raise exception 'Acceso no autorizado.'; end if;
  select * into doc from public.sales_documents where id = p_id for update;
  if not found or doc.kind <> 'invoice' or doc.status <> 'issued' then raise exception 'Selecciona una factura emitida.'; end if;
  select coalesce(sum(amount),0) into paid from public.project_payments where sales_document_id = p_id;
  if p_amount is null or p_amount <= 0 or p_amount <> round(p_amount,2) or p_amount > doc.total - paid then raise exception 'El cobro supera el importe pendiente o no es válido.'; end if;
  if p_date is null or p_date < doc.issue_date or p_method not in ('Transferencia','Efectivo','Bizum','Tarjeta','Otro') then raise exception 'Revisa la fecha y la forma de pago.'; end if;
  insert into public.project_payments(project_id, sales_document_id, amount, payment_date, method, notes, created_by)
    values (doc.project_id, doc.id, p_amount, p_date, p_method, 'Cobro factura ' || doc.number, auth.uid()) returning id into result;
  return result;
end; $$;

revoke execute on function public.create_sales_document(text,uuid,uuid), public.save_sales_document(uuid,jsonb), public.issue_sales_document(uuid), public.delete_sales_draft(uuid), public.record_sales_payment(uuid,numeric,date,text) from public, anon;
grant execute on function public.create_sales_document(text,uuid,uuid), public.save_sales_document(uuid,jsonb), public.issue_sales_document(uuid), public.delete_sales_draft(uuid), public.record_sales_payment(uuid,numeric,date,text) to authenticated;
notify pgrst, 'reload schema';
commit;
