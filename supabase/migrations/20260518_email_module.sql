create table if not exists public.sent_emails (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete set null,
  to_email text not null,
  subject text not null,
  body text not null,
  status text not null default 'sent' check (status in ('sent', 'failed')),
  error_message text,
  sent_by uuid not null references public.profiles(user_id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists sent_emails_created_at_idx on public.sent_emails(created_at desc);
create index if not exists sent_emails_project_idx on public.sent_emails(project_id, created_at desc);

alter table public.sent_emails enable row level security;

drop policy if exists "sent_emails_all_authorized" on public.sent_emails;
create policy "sent_emails_all_authorized"
on public.sent_emails for all
to authenticated
using (public.is_decoralia_user())
with check (public.is_decoralia_user() and sent_by = auth.uid());
