alter table public.rooms
add column if not exists manual_area numeric(10, 2) not null default 0;

alter table public.rooms
drop constraint if exists rooms_paint_scope_check;

alter table public.rooms
add constraint rooms_paint_scope_check
check (paint_scope in ('walls_and_ceiling', 'ceiling_only', 'manual_area'));

alter table public.rooms
drop constraint if exists rooms_length_check;

alter table public.rooms
add constraint rooms_length_check
check (length >= 0);

alter table public.rooms
drop constraint if exists rooms_width_check;

alter table public.rooms
add constraint rooms_width_check
check (width >= 0);

alter table public.rooms
drop constraint if exists rooms_height_check;

alter table public.rooms
add constraint rooms_height_check
check (height >= 0);

alter table public.rooms
drop column if exists total_paintable_area;

alter table public.rooms
add column total_paintable_area numeric(10, 2) generated always as (
  case
    when paint_scope = 'manual_area' then manual_area
    when paint_scope = 'ceiling_only' then round(length * width, 2)
    else greatest(round((length * width) + (2 * (length + width) * height) - openings_area, 2), 0)
  end
) stored;
