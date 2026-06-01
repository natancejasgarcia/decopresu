alter table public.project_expenses
add column if not exists receipt_file_name text,
add column if not exists receipt_file_url text,
add column if not exists receipt_file_type text;
