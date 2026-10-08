-- A permanent shared board. Compare-and-swap prevents lost concurrent edits.
create table if not exists public.briefing_boards (
  id text primary key check (id = 'shared'),
  scene jsonb not null default '{"elements":[],"appState":{"viewBackgroundColor":"#ffffff"},"files":{}}',
  version integer not null default 0 check (version >= 0),
  updated_by uuid references public.profiles(user_id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint briefing_scene_size check (octet_length(scene::text) <= 8388608)
);
insert into public.briefing_boards(id) values ('shared') on conflict do nothing;
alter table public.briefing_boards enable row level security;
drop policy if exists briefing_team_read on public.briefing_boards;
create policy briefing_team_read on public.briefing_boards for select to authenticated
  using (public.is_decoralia_user());
revoke all on public.briefing_boards from anon, authenticated;
grant select on public.briefing_boards to authenticated;

create or replace function public.save_briefing_board(p_expected_version integer, p_scene jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare current_board public.briefing_boards;
begin
  if not public.is_decoralia_user() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if jsonb_typeof(p_scene) is distinct from 'object'
     or jsonb_typeof(p_scene->'elements') is distinct from 'array'
     or jsonb_typeof(p_scene->'files') is distinct from 'object'
     or jsonb_typeof(p_scene->'appState') is distinct from 'object'
     or octet_length(p_scene::text) > 8388608 then
    raise exception 'Pizarra no valida o demasiado grande';
  end if;
  select * into strict current_board from public.briefing_boards where id = 'shared' for update;
  if current_board.version <> p_expected_version then
    return jsonb_build_object('ok', false, 'board', to_jsonb(current_board));
  end if;
  update public.briefing_boards set scene = p_scene, version = version + 1,
    updated_by = auth.uid(), updated_at = now() where id = 'shared' returning * into current_board;
  return jsonb_build_object('ok', true, 'board', to_jsonb(current_board));
end;
$$;
revoke all on function public.save_briefing_board(integer,jsonb) from public, anon;
grant execute on function public.save_briefing_board(integer,jsonb) to authenticated;
