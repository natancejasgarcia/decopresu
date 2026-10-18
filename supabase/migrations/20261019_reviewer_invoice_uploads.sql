-- Apply after 20261018_access_and_finance_ai.sql. No financial rows are changed.
begin;
create or replace function public.reviewer_invoice_uploads_ready() returns boolean
language sql stable set search_path=public,pg_temp as $$
  select public.app_access_role() is not null;
$$;
revoke all on function public.reviewer_invoice_uploads_ready() from public,anon;
grant execute on function public.reviewer_invoice_uploads_ready() to authenticated;

drop policy if exists finance_documents_read on public.finance_documents;
create policy finance_documents_read on public.finance_documents for select to authenticated using(
  public.is_decoralia_user() or (public.app_access_role()='reviewer' and created_by=auth.uid() and status='draft')
);
drop policy if exists finance_documents_insert on public.finance_documents;
create policy finance_documents_insert on public.finance_documents for insert to authenticated with check(
  created_by=auth.uid() and (
    public.is_decoralia_user() or (
      public.app_access_role()='reviewer' and status='draft'
      and file_path ~ ('^finance-scans/' || auth.uid()::text || '/[0-9a-f-]{36}\.(jpeg|png|webp)$')
      and file_type in ('image/jpeg','image/png','image/webp')
    )
  )
);
-- Reviewer may only upload/read original photos in their own immutable namespace.
-- No UPDATE or DELETE permission: posted invoice originals must remain intact.
drop policy if exists reviewer_invoice_upload on storage.objects;
create policy reviewer_invoice_upload on storage.objects for insert to authenticated with check(
  bucket_id='project-files' and public.app_access_role()='reviewer'
  and name ~ ('^finance-scans/' || auth.uid()::text || '/[0-9a-f-]{36}\.(jpeg|png|webp)$')
);
drop policy if exists reviewer_invoice_photo_read on storage.objects;
create policy reviewer_invoice_photo_read on storage.objects for select to authenticated using(
  bucket_id='project-files' and public.app_access_role()='reviewer'
  and name ~ ('^finance-scans/' || auth.uid()::text || '/[0-9a-f-]{36}\.(jpeg|png|webp)$')
);
commit;
