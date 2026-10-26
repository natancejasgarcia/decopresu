begin;
alter table public.project_payments
  add column if not exists receipt_file_name text,
  add column if not exists receipt_file_url text,
  add column if not exists receipt_file_type text;

create or replace function public.record_sales_payment_with_receipt(
  p_id uuid, p_payment_id uuid, p_amount numeric, p_date date, p_method text,
  p_receipt jsonb default null
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare doc public.sales_documents; existing public.project_payments; paid numeric;
  receipt_path text; receipt_name text; receipt_type text; prefix text;
begin
  if not public.is_decoralia_user() or auth.uid() is null then raise exception 'Acceso no autorizado.'; end if;
  if p_payment_id is null then raise exception 'Falta el identificador del cobro.'; end if;
  select * into doc from public.sales_documents where id=p_id for update;
  if not found or doc.kind<>'invoice' or doc.status<>'issued' then raise exception 'Selecciona una factura emitida.'; end if;
  if p_amount is null or p_amount<=0 or p_amount<>round(p_amount,2) or p_amount>99999999 then
    raise exception 'Revisa el importe del cobro.'; end if;
  if p_date is null or p_date<doc.issue_date or p_method is null
    or p_method not in('Transferencia','Efectivo','Bizum','Tarjeta','Otro') then
    raise exception 'Revisa la fecha y la forma de pago.'; end if;
  if p_receipt is not null and p_receipt<>'null'::jsonb then
    if jsonb_typeof(p_receipt)<>'object' or coalesce(length(p_receipt->>'name'),0) not between 1 and 255
      or coalesce(p_receipt->>'size','') !~ '^[0-9]{1,8}$'
      or coalesce(p_receipt->>'type','') not in('application/pdf','image/jpeg','image/png','image/webp','image/gif','image/heic')
    then raise exception 'Justificante no valido. Elige una imagen o PDF de hasta 10 MB.'; end if;
    if (p_receipt->>'size')::numeric not between 1 and 10485760 then raise exception 'El justificante supera los 10 MB.'; end if;
    receipt_path:=p_receipt->>'path'; receipt_name:=p_receipt->>'name'; receipt_type:=p_receipt->>'type';
    prefix:='sales-payments/'||p_id::text||'/'||auth.uid()::text||'/'||p_payment_id::text||'/';
    if receipt_path is null or left(receipt_path,length(prefix))<>prefix
      or substring(receipt_path from length(prefix)+1) !~ '^[0-9a-f-]{36}\.(pdf|jpeg|png|webp|gif|heic)$'
    then raise exception 'El justificante no pertenece a este cobro.'; end if;
  end if;
  select * into existing from public.project_payments where id=p_payment_id;
  if found then
    if existing.sales_document_id is distinct from p_id or existing.created_by is distinct from auth.uid()
      or existing.amount is distinct from p_amount or existing.payment_date is distinct from p_date
      or existing.method is distinct from p_method or existing.receipt_file_url is distinct from receipt_path
      or existing.receipt_file_name is distinct from receipt_name or existing.receipt_file_type is distinct from receipt_type
    then raise exception 'Este cobro ya se guardo con otros datos. Comprueba la lista antes de repetirlo.'; end if;
    return existing.id;
  end if;
  if receipt_path is not null and not exists(select 1 from storage.objects
    where bucket_id='project-files' and name=receipt_path
      and metadata->>'size'=p_receipt->>'size' and metadata->>'mimetype'=receipt_type)
  then raise exception 'No se pudo comprobar el justificante subido. No se ha registrado el cobro.'; end if;
  select coalesce(sum(amount),0) into paid from public.project_payments where sales_document_id=p_id;
  if p_amount>doc.total-paid then raise exception 'El cobro supera el importe pendiente.'; end if;
  insert into public.project_payments(id,project_id,sales_document_id,amount,payment_date,method,notes,created_by,
    receipt_file_name,receipt_file_url,receipt_file_type)
  values(p_payment_id,doc.project_id,doc.id,p_amount,p_date,p_method,'Cobro factura '||doc.number,auth.uid(),
    receipt_name,receipt_path,receipt_type);
  return p_payment_id;
end; $$;
revoke all on function public.record_sales_payment_with_receipt(uuid,uuid,numeric,date,text,jsonb) from public,anon;
grant execute on function public.record_sales_payment_with_receipt(uuid,uuid,numeric,date,text,jsonb) to authenticated;
notify pgrst, 'reload schema';
commit;
