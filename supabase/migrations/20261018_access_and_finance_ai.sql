begin;
-- Protected access assignments cannot be edited through user profiles.
create table if not exists public.workspace_access (
  user_id uuid primary key references auth.users(id) on delete cascade,
  access_role text not null check (access_role in ('owner','reviewer','workspace'))
);
alter table public.workspace_access enable row level security;
revoke all on public.workspace_access from anon, authenticated;
grant select on public.workspace_access to authenticated;

do $$
declare owner_id uuid; reviewer_id uuid; candidates integer;
begin
  if not exists(select 1 from public.workspace_access where access_role='owner') then
    select count(*), (array_agg(user_id))[1] into candidates, owner_id from public.profiles
      where lower(translate(trim(name),'ÁÉÍÓÚáéíóú','AEIOUaeiou')) = 'jose antonio';
    if candidates <> 1 then raise exception 'Identifica un unico perfil Jose Antonio antes de activar los permisos.'; end if;
    insert into public.workspace_access values(owner_id,'owner');
  end if;
  select id into reviewer_id from auth.users where lower(email)='decoralia1977@gmail.com';
  if reviewer_id is null then
    select count(*),(array_agg(user_id))[1] into candidates,reviewer_id from public.profiles where lower(trim(name)) in ('coralia','decoralia');
    if candidates<>1 then raise exception 'Identifica la cuenta Coralia/Decoralia antes de activar los permisos.'; end if;
  end if;
  if exists(select 1 from public.workspace_access where user_id=reviewer_id and access_role='owner') then
    raise exception 'La cuenta propietaria y la revisora deben ser distintas.';
  end if;
  insert into public.workspace_access values(reviewer_id,'reviewer') on conflict(user_id) do update set access_role='reviewer';
end $$;

create or replace function public.app_access_role() returns text language sql stable security definer set search_path=public,pg_temp as $$
  select case when lower(coalesce(auth.jwt()->>'email',''))='decoralia1977@gmail.com' then 'reviewer'
    else coalesce((select access_role from workspace_access where user_id=auth.uid()),'workspace') end
  where exists(select 1 from profiles where user_id=auth.uid());
$$;
create or replace function public.is_decoralia_user() returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select coalesce(public.app_access_role() in ('owner','workspace'),false);
$$;
create or replace function public.is_validation_owner() returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select coalesce(public.app_access_role()='owner',false);
$$;
drop policy if exists access_read on public.workspace_access;
create policy access_read on public.workspace_access for select to authenticated using(user_id=auth.uid() or public.is_validation_owner());
drop policy if exists profiles_select_authorized on public.profiles;
create policy profiles_select_authorized on public.profiles for select to authenticated using(user_id=auth.uid() or public.is_decoralia_user());
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update to authenticated using(user_id=auth.uid() and public.is_decoralia_user()) with check(user_id=auth.uid() and public.is_decoralia_user());
drop policy if exists profiles_insert_auto_authorized_decoralia on public.profiles;
create policy profiles_insert_auto_authorized_decoralia on public.profiles for insert to authenticated
  with check(user_id=auth.uid() and lower(coalesce(auth.jwt()->>'email',''))='decoralia1977@gmail.com' and role='member');

do $$ declare p record; begin
  for p in select policyname from pg_policies where schemaname='public' and tablename='budget_validations' loop
    execute format('drop policy %I on public.budget_validations',p.policyname);
  end loop;
end $$;
create policy validation_read on public.budget_validations for select to authenticated
  using(public.is_validation_owner() or (not is_validated and public.app_access_role() is not null));
create policy validation_insert on public.budget_validations for insert to authenticated with check(public.is_decoralia_user() and created_by=auth.uid() and not is_validated);
create policy validation_update on public.budget_validations for update to authenticated
  using(public.is_decoralia_user() and (not is_validated or public.is_validation_owner()))
  with check(public.is_decoralia_user() and (not is_validated or public.is_validation_owner()));
create policy validation_delete on public.budget_validations for delete to authenticated using(public.is_validation_owner());
-- Older versions left the OK flag set when requesting corrections.
update public.budget_validations set is_validated=false,validated_by=null,validated_at=null
  where is_validated and nullif(trim(validation_notes),'') is not null;
drop policy if exists reviewer_pdf_read on storage.objects;
create policy reviewer_pdf_read on storage.objects for select to authenticated using(
  bucket_id='project-files' and public.app_access_role()='reviewer'
  and exists(select 1 from public.budget_validations v where v.file_url=storage.objects.name and not v.is_validated)
);

create or replace function public.review_budget_validation(p_id uuid,p_operation text,p_notes text default null)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v public.budget_validations;
begin
  if public.app_access_role() is null then raise exception 'No autorizado' using errcode='42501'; end if;
  select * into v from budget_validations where id=p_id for update;
  if not found or (v.is_validated and not public.is_validation_owner()) then raise exception 'Presupuesto no disponible para revisar'; end if;
  if p_operation='approve' then
    update budget_validations set is_validated=true,validation_notes=null,validated_by=auth.uid(),validated_at=now() where id=p_id;
  elsif p_operation='notes' and length(coalesce(p_notes,''))<=4000 then
    update budget_validations set validation_notes=nullif(trim(p_notes),''),
      is_validated=case when nullif(trim(p_notes),'') is not null then false else is_validated end,
      validated_by=case when nullif(trim(p_notes),'') is not null then null else validated_by end,
      validated_at=case when nullif(trim(p_notes),'') is not null then null else validated_at end where id=p_id;
  else raise exception 'Operacion no valida'; end if;
end $$;
revoke all on function public.review_budget_validation(uuid,text,text) from public,anon;
grant execute on function public.review_budget_validation(uuid,text,text) to authenticated;
alter table public.project_expenses add column if not exists receipt_file_name text, add column if not exists receipt_file_url text, add column if not exists receipt_file_type text;
alter table public.project_payments add column if not exists receipt_file_name text, add column if not exists receipt_file_url text, add column if not exists receipt_file_type text;
alter table public.project_payments alter column project_id drop not null;
create table if not exists public.finance_documents (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.profiles(user_id),
  file_path text not null unique, file_name text not null, file_type text not null,
  file_size integer not null check(file_size between 1 and 10485760),
  file_hash text not null unique check(length(file_hash)=64),
  extracted jsonb not null default '{}', invoice_data jsonb not null default '{}',
  status text not null default 'draft' check(status in ('draft','posted')),
  expense_id uuid references public.project_expenses(id) on delete set null,
  payment_id uuid references public.project_payments(id) on delete set null,
  created_at timestamptz not null default now(), posted_at timestamptz
);
create unique index if not exists finance_invoice_identity on public.finance_documents
  ((upper(regexp_replace(invoice_data->>'tax_id','[^a-zA-Z0-9]','','g'))),(lower(trim(invoice_data->>'invoice_number'))),(invoice_data->>'direction'))
  where status='posted' and coalesce(trim(invoice_data->>'tax_id'),'')<>'' and coalesce(trim(invoice_data->>'invoice_number'),'')<>'';
alter table public.finance_documents enable row level security;
revoke all on public.finance_documents from anon,authenticated;
grant select on public.finance_documents to authenticated;
grant insert(created_by,file_path,file_name,file_type,file_size,file_hash) on public.finance_documents to authenticated;
grant update(extracted) on public.finance_documents to authenticated;
grant delete on public.finance_documents to authenticated;
drop policy if exists finance_documents_read on public.finance_documents;
create policy finance_documents_read on public.finance_documents for select to authenticated using(public.is_decoralia_user());
drop policy if exists finance_documents_insert on public.finance_documents;
create policy finance_documents_insert on public.finance_documents for insert to authenticated with check(public.is_decoralia_user() and created_by=auth.uid());
drop policy if exists finance_documents_update on public.finance_documents;
create policy finance_documents_update on public.finance_documents for update to authenticated using(public.is_decoralia_user() and status='draft') with check(public.is_decoralia_user() and status='draft');
drop policy if exists finance_documents_delete on public.finance_documents;
create policy finance_documents_delete on public.finance_documents for delete to authenticated using(public.is_decoralia_user() and status='draft');

create or replace function public.post_finance_document(p_id uuid,p_data jsonb) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare d finance_documents; subtotal numeric; tax numeric; total numeric; paid numeric;
  project uuid; issued date; payment_date date; expense uuid; payment uuid; direction text;
begin
  if not public.is_decoralia_user() then raise exception 'No autorizado' using errcode='42501'; end if;
  select * into d from finance_documents where id=p_id for update;
  if not found then raise exception 'Documento no disponible'; end if;
  if d.status='posted' then return d.id; end if;
  subtotal=(p_data->>'subtotal')::numeric; tax=(p_data->>'tax')::numeric;
  total=(p_data->>'total')::numeric; paid=(p_data->>'paid_amount')::numeric;
  direction=p_data->>'direction'; issued=(p_data->>'issue_date')::date;
  payment_date=nullif(p_data->>'payment_date','')::date;
  project=nullif(p_data->>'project_id','')::uuid;
  if direction is null or direction not in ('income','expense') or p_data->>'currency' is distinct from 'EUR'
    or subtotal is null or tax is null or total is null or paid is null or issued is null
    or subtotal<0 or tax<0 or total<=0 or total>99999999 or paid<0 or paid>total
    or round(subtotal,2)<>subtotal or round(tax,2)<>tax or round(total,2)<>total or round(paid,2)<>paid
    or abs(subtotal+tax-total)>0.02 or (paid>0 and payment_date is null)
    or length(trim(coalesce(p_data->>'party_name','')))=0 or length(coalesce(p_data->>'party_name',''))>200
    or length(trim(coalesce(p_data->>'concept','')))=0 or length(coalesce(p_data->>'concept',''))>500
    or length(coalesce(p_data->>'notes',''))>4000
    or length(coalesce(p_data->>'tax_id',''))>50 or length(coalesce(p_data->>'invoice_number',''))>100
    then raise exception 'Revisa tipo, fechas, tercero e importes (base + impuestos = total).'; end if;
  if project is not null and not exists(select 1 from projects where id=project) then raise exception 'Obra no disponible'; end if;
  if (p_data->>'method') is null or (p_data->>'method') not in ('Transferencia','Efectivo','Bizum','Tarjeta','Otro')
    or (p_data->>'category') is null or (p_data->>'category') not in ('Materiales','Mano de obra','Gasolina','Herramientas','Subcontrata','Otros') then raise exception 'Categoria o metodo no valido'; end if;
  if direction='expense' then
    insert into project_expenses(project_id,category,supplier,concept,amount,expense_date,is_paid,notes,receipt_file_name,receipt_file_url,receipt_file_type,created_by)
    values(project,p_data->>'category',p_data->>'party_name',p_data->>'concept',total,issued,paid=total,
      concat('Factura ',p_data->>'invoice_number', '. Pagado: ',paid,' EUR. ',p_data->>'notes'),d.file_name,d.file_path,d.file_type,auth.uid()) returning id into expense;
  elsif paid>0 then
    insert into project_payments(project_id,amount,payment_date,method,notes,receipt_file_name,receipt_file_url,receipt_file_type,created_by)
    values(project,paid,payment_date,p_data->>'method',concat('Factura ',p_data->>'invoice_number',' - ',p_data->>'party_name','. ',p_data->>'notes'),d.file_name,d.file_path,d.file_type,auth.uid()) returning id into payment;
  end if;
  update finance_documents set invoice_data=p_data,status='posted',posted_at=now(),expense_id=expense,payment_id=payment where id=p_id;
  return p_id;
end $$;
revoke all on function public.post_finance_document(uuid,jsonb) from public,anon;
grant execute on function public.post_finance_document(uuid,jsonb) to authenticated;
commit;
