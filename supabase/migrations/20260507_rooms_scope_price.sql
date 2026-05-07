alter table public.rooms
add column if not exists paint_scope text not null default 'walls_and_ceiling';

alter table public.rooms
add column if not exists unit_price numeric(10, 2) not null default 6;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'rooms_paint_scope_check'
  ) then
    alter table public.rooms
    add constraint rooms_paint_scope_check
    check (paint_scope in ('walls_and_ceiling', 'ceiling_only'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'rooms_unit_price_check'
  ) then
    alter table public.rooms
    add constraint rooms_unit_price_check
    check (unit_price >= 0);
  end if;
end $$;

alter table public.rooms
drop column if exists total_paintable_area;

alter table public.rooms
add column total_paintable_area numeric(10, 2) generated always as (
  case
    when paint_scope = 'ceiling_only' then round(length * width, 2)
    else greatest(round((length * width) + (2 * (length + width) * height) - openings_area, 2), 0)
  end
) stored;
