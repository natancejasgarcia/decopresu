alter table public.rooms
drop constraint if exists rooms_paint_scope_check;

alter table public.rooms
add constraint rooms_paint_scope_check
check (paint_scope in ('walls_and_ceiling', 'ceiling_only', 'walls_only', 'manual_area'));

alter table public.rooms
drop column if exists total_paintable_area;

alter table public.rooms
add column total_paintable_area numeric(10, 2) generated always as (
  case
    when paint_scope = 'manual_area' then manual_area
    when paint_scope = 'ceiling_only' then round(length * width, 2)
    when paint_scope = 'walls_only' then greatest(round((2 * (length + width) * height) - openings_area, 2), 0)
    else greatest(round((length * width) + (2 * (length + width) * height) - openings_area, 2), 0)
  end
) stored;
