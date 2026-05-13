alter table public.budget_items
add column if not exists sort_order integer not null default 0 check (sort_order >= 0);

with ordered_items as (
  select
    id,
    row_number() over (partition by project_id order by created_at asc, id asc) as row_position
  from public.budget_items
)
update public.budget_items as item
set sort_order = ordered_items.row_position
from ordered_items
where item.id = ordered_items.id
  and item.sort_order = 0;

create index if not exists budget_items_project_sort_order_idx
on public.budget_items(project_id, sort_order, created_at);
