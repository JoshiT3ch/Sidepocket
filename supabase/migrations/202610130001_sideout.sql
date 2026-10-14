-- Sideout: account-owned cosmetics and transactional doubles ratings.
-- Clients access only the narrowly granted, authenticated RPCs below.
create schema if not exists sideout;
revoke all on schema sideout from public, anon, authenticated;

create table sideout.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  updated_at timestamptz not null default pg_catalog.now()
);
create table sideout.players (
  user_id uuid primary key references auth.users(id) on delete cascade,
  code text not null unique check (code ~ '^SO-[A-F0-9]{12}$'),
  rating bigint not null default 1200 check (rating between 100 and 9007199254740991),
  games bigint not null default 0 check (games >= 0),
  wins bigint not null default 0 check (wins between 0 and games)
);
create table sideout.duos (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  player_a uuid not null references sideout.players(user_id),
  player_b uuid not null references sideout.players(user_id),
  created_at timestamptz not null default pg_catalog.now(),
  dissolved_at timestamptz,
  check (player_a <> player_b)
);
-- This primary key enforces at most one active duo for each player, even in a race.
create table sideout.duo_members (
  user_id uuid primary key references sideout.players(user_id),
  duo_id uuid not null references sideout.duos(id)
);
create index sideout_duos_a on sideout.duos(player_a);
create index sideout_duos_b on sideout.duos(player_b);
create index sideout_members_duo on sideout.duo_members(duo_id);
create table sideout.invitations (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  from_id uuid not null references sideout.players(user_id),
  to_id uuid not null references sideout.players(user_id),
  status text not null default 'pending' check (status in ('pending','accepted','declined','expired','cancelled')),
  created_at timestamptz not null default pg_catalog.now(),
  expires_at timestamptz not null default (pg_catalog.now() + interval '24 hours'),
  check (from_id <> to_id)
);
create index sideout_invites_to on sideout.invitations(to_id, status, created_at desc);
create index sideout_invites_from on sideout.invitations(from_id, status, created_at desc);
create table sideout.matches (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  status text not null default 'pending' check (status in ('pending','active','completed','cancelled')),
  duo_a uuid not null references sideout.duos(id),
  duo_b uuid not null references sideout.duos(id),
  player_a1 uuid not null references sideout.players(user_id),
  player_a2 uuid not null references sideout.players(user_id),
  player_b1 uuid not null references sideout.players(user_id),
  player_b2 uuid not null references sideout.players(user_id),
  teams jsonb not null,
  created_by uuid not null references sideout.players(user_id),
  created_at timestamptz not null default pg_catalog.now(),
  expires_at timestamptz not null default (pg_catalog.now() + interval '24 hours'),
  reported_by uuid references sideout.players(user_id),
  completed_at timestamptz,
  winner_side text check (winner_side in ('a','b')),
  deltas jsonb,
  check (duo_a <> duo_b),
  check (player_a1 <> player_a2 and player_a1 <> player_b1 and player_a1 <> player_b2 and
         player_a2 <> player_b1 and player_a2 <> player_b2 and player_b1 <> player_b2),
  check (created_by in (player_a1, player_a2)),
  check (reported_by is null or reported_by in (player_a1,player_a2,player_b1,player_b2)),
  check ((status = 'completed') = (completed_at is not null and winner_side is not null and deltas is not null))
);
create index sideout_matches_a1 on sideout.matches(player_a1,created_at desc);
create index sideout_matches_a2 on sideout.matches(player_a2,created_at desc);
create index sideout_matches_b1 on sideout.matches(player_b1,created_at desc);
create index sideout_matches_b2 on sideout.matches(player_b2,created_at desc);
create index sideout_matches_duo_a on sideout.matches(duo_a);
create index sideout_matches_duo_b on sideout.matches(duo_b);
create index sideout_matches_reporter on sideout.matches(reported_by);
create index sideout_matches_creator on sideout.matches(created_by);

alter table sideout.profiles enable row level security;
alter table sideout.players enable row level security;
alter table sideout.duos enable row level security;
alter table sideout.duo_members enable row level security;
alter table sideout.invitations enable row level security;
alter table sideout.matches enable row level security;
-- No client table policies: privileged RPCs perform explicit ownership checks.
revoke all on all tables in schema sideout from public, anon, authenticated;

create function sideout.me() returns uuid language plpgsql set search_path = '' as $$
declare v_id uuid := auth.uid();
begin
  if v_id is null or not exists(select 1 from auth.users u where u.id = v_id) then
    raise exception 'Please log in to continue.' using errcode = '42501';
  end if;
  return v_id;
end $$;

create function sideout.defaults(p_name text) returns jsonb language sql immutable set search_path = '' as $$
  select pg_catalog.jsonb_build_object(
    'name',p_name,'skin','#cf986c','shirt','#ed795d','paddle','#7286bb','hat','cap',
    'height',170,'bodyType','regular','characterType','male','hairStyle','short','hairColor','#43352f',
    'avatarCreated',false,'capId','nike-court-cap','shirtId','custom','bottomId','nike-field-shorts',
    'rating',1200,'games',0,'wins',0,'history','[]'::jsonb)
$$;

create function sideout.ensure(p_id uuid) returns void language plpgsql set search_path = '' as $$
declare v_name text; v_attempt integer := 0;
begin
  select pg_catalog.left(pg_catalog.btrim(coalesce(nullif(u.raw_user_meta_data->>'name',''),'Court Rookie')),24)
  into v_name from auth.users u where u.id = p_id;
  if not found then raise exception 'Player not found.' using errcode = 'P0002'; end if;
  if v_name = '' then v_name := 'Court Rookie'; end if;
  insert into sideout.profiles(user_id,data) values(p_id,sideout.defaults(v_name)) on conflict(user_id) do nothing;
  while not exists(select 1 from sideout.players p where p.user_id = p_id) loop
    begin
      insert into sideout.players(user_id,code)
      values(p_id,'SO-' || pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(pg_catalog.gen_random_uuid()::text,'-',''),1,12)))
      on conflict(user_id) do nothing;
    exception when unique_violation then
      v_attempt := v_attempt + 1;
      if v_attempt > 5 then raise exception 'Could not create player code.'; end if;
    end;
  end loop;
end $$;

create function sideout.ready(p_id uuid) returns void language plpgsql set search_path = '' as $$
begin
  perform sideout.ensure(p_id);
  if (select p.data->'avatarCreated' from sideout.profiles p where p.user_id = p_id) is distinct from 'true'::jsonb then
    raise exception 'Create your avatar before playing a rated game.';
  end if;
end $$;

create function sideout.lock_players(p_ids uuid[]) returns void language plpgsql set search_path = '' as $$
begin
  perform p.user_id from sideout.players p where p.user_id = any(p_ids) order by p.user_id for update;
end $$;

create function sideout.validate_profile(p_data jsonb) returns jsonb language plpgsql immutable set search_path = '' as $$
declare v_name text; v_key text; v_result jsonb;
begin
  if pg_catalog.jsonb_typeof(p_data) <> 'object' then raise exception 'Please send valid form data.'; end if;
  v_name := pg_catalog.btrim(p_data->>'name');
  if pg_catalog.jsonb_typeof(p_data->'name') is distinct from 'string' or pg_catalog.length(v_name) not between 1 and 24 then
    raise exception 'Use a player name between 1 and 24 characters.';
  end if;
  if pg_catalog.jsonb_typeof(p_data->'height') is distinct from 'number' or
     coalesce(p_data->>'height','') !~ '^[0-9]+$' then raise exception 'Choose a height between 120 and 220 cm.'; end if;
  if (p_data->>'height')::numeric not between 120 and 220 then raise exception 'Choose a height between 120 and 220 cm.'; end if;
  if coalesce(p_data->>'bodyType','') <> all(array['lean','regular','broad']) then raise exception 'Choose an available body type.'; end if;
  if coalesce(p_data->>'characterType','') <> all(array['male','female']) then raise exception 'Choose an available character style.'; end if;
  if pg_catalog.jsonb_typeof(p_data->'avatarCreated') is distinct from 'boolean' then raise exception 'Invalid avatar setup status.'; end if;
  if (p_data->>'characterType' = 'male' and coalesce(p_data->>'hairStyle','') <> all(array['short','buzz','side-part','spiky','curly','afro'])) or
     (p_data->>'characterType' = 'female' and coalesce(p_data->>'hairStyle','') <> all(array['bob','long','ponytail','bun'])) then
    raise exception 'Choose a hairstyle available for your selected character.';
  end if;
  if coalesce(p_data->>'hairColor','') <> all(array['#292727','#43352f','#87583c','#d6b66b','#b66a40','#b7b8ba']) then raise exception 'Choose a hair color from the available colors.'; end if;
  if coalesce(p_data->>'skin','') <> all(array['#f1c49b','#cf986c','#a96c4b','#704630']) or
     coalesce(p_data->>'shirt','') <> all(array['#ed795d','#a6bce0','#ede8cd','#8da65d','#b59fc6','#293444','#eee9d5','#445d78','#bc7959','#363345']) or
     coalesce(p_data->>'paddle','') <> all(array['#7286bb','#ed795d','#d2e48e','#8f709d']) or
     coalesce(p_data->>'hat','') <> all(array['none','cap','headband']) then raise exception 'Choose an available character option.'; end if;
  if coalesce(p_data->>'capId','') <> all(array['nike-court-cap','nike-night-cap','nike-coral-cap','nike-mesh-cap','nike-court-visor','adidas-three-cap','adidas-sky-cap','adidas-lilac-cap','adidas-sand-cap','adidas-reverse-cap']) then raise exception 'Choose an available cap.'; end if;
  if coalesce(p_data->>'shirtId','') <> all(array['custom','nike-coral-tee','nike-night-tee','nike-cloud-tank','nike-club-polo','nike-lilac-zip','adidas-cream-tee','adidas-forest-jersey','adidas-sky-raglan','adidas-clay-polo','adidas-track-top']) then raise exception 'Choose an available shirt.'; end if;
  if coalesce(p_data->>'bottomId','') <> all(array['nike-field-shorts','nike-night-shorts','nike-sand-shorts','nike-coral-shorts','nike-cloud-shorts','adidas-three-shorts','adidas-moss-shorts','adidas-sky-shorts','adidas-lilac-shorts','adidas-clay-shorts','nike-night-joggers','nike-field-pants','nike-sand-cargo','nike-cloud-joggers','nike-lilac-pants','adidas-three-pants','adidas-forest-pants','adidas-sky-pants','adidas-clay-joggers','adidas-club-pants']) then raise exception 'Choose available shorts or pants.'; end if;
  -- Legacy demo fields remain inert. Real ratings cannot be assigned by profile updates.
  v_result := sideout.defaults(v_name);
  foreach v_key in array array['skin','shirt','paddle','hat','height','bodyType','characterType','hairStyle','hairColor','avatarCreated','capId','shirtId','bottomId'] loop
    v_result := pg_catalog.jsonb_set(v_result,array[v_key],p_data->v_key);
  end loop;
  return v_result;
end $$;

create function sideout.player_view(p_id uuid) returns jsonb language sql stable set search_path = '' as $$
  select pg_catalog.jsonb_build_object('id',p.user_id,'name',f.data->>'name','code',p.code,
    'rating',p.rating,'games',p.games,'wins',p.wins,
    'avatar',pg_catalog.jsonb_build_object('skin',f.data->'skin','shirt',f.data->'shirt','paddle',f.data->'paddle',
      'hat',f.data->'hat','height',f.data->'height','bodyType',f.data->'bodyType','characterType',f.data->'characterType',
      'hairStyle',f.data->'hairStyle','hairColor',f.data->'hairColor','capId',f.data->'capId','shirtId',f.data->'shirtId','bottomId',f.data->'bottomId'))
  from sideout.players p join sideout.profiles f on f.user_id = p.user_id where p.user_id = p_id
$$;

create function sideout.code_player(p_code text) returns uuid language plpgsql stable set search_path = '' as $$
declare v_id uuid;
begin
  if p_code is null or pg_catalog.btrim(p_code) !~* '^SO-[A-F0-9]{12}$' then raise exception 'Enter a valid player code, such as SO-123456ABCDEF.'; end if;
  select p.user_id into v_id from sideout.players p join sideout.profiles f on f.user_id = p.user_id
  where p.code = pg_catalog.upper(pg_catalog.btrim(p_code)) and f.data->'avatarCreated' = 'true'::jsonb;
  if not found then raise exception 'Player not found. Ask them to finish their avatar first.' using errcode = 'P0002'; end if;
  return v_id;
end $$;

create function sideout.duo_for(p_id uuid) returns uuid language sql stable set search_path = '' as $$
  select m.duo_id from sideout.duo_members m where m.user_id = p_id
$$;
create function sideout.duo_view(p_id uuid) returns jsonb language sql stable set search_path = '' as $$
  select pg_catalog.jsonb_build_object('id',d.id,'players',pg_catalog.jsonb_build_array(sideout.player_view(d.player_a),sideout.player_view(d.player_b)))
  from sideout.duos d where d.id = p_id and d.dissolved_at is null
$$;
create function sideout.free(p_ids uuid[]) returns void language plpgsql stable set search_path = '' as $$
begin
  if exists(select 1 from sideout.matches m where
    (m.status = 'active' or (m.status = 'pending' and m.expires_at > pg_catalog.now())) and
    (m.player_a1 = any(p_ids) or m.player_a2 = any(p_ids) or m.player_b1 = any(p_ids) or m.player_b2 = any(p_ids))) then
    raise exception 'One of these players already has an unfinished game. Finish or cancel it first.';
  end if;
end $$;

create function sideout.award(p_winner numeric,p_opponent numeric) returns integer language sql immutable set search_path = '' as $$
  -- Clamping only avoids power overflow; the rounded 20-40 award is unchanged.
  select 20 + pg_catalog.round(20 * (1 - 1 / (1 + pg_catalog.power(10::numeric,
    greatest(-20::numeric,least(20::numeric,(p_opponent-p_winner)/400))))))::integer
$$;
create function sideout.preview(p_teams jsonb) returns jsonb language sql immutable set search_path = '' as $$
  select pg_catalog.jsonb_build_object('a',sideout.award(a,b),'b',sideout.award(b,a))
  from (select ((p_teams->'a'->0->>'rating')::numeric+(p_teams->'a'->1->>'rating')::numeric)/2 as a,
               ((p_teams->'b'->0->>'rating')::numeric+(p_teams->'b'->1->>'rating')::numeric)/2 as b) averages
$$;
create function sideout.millis(p_time timestamptz) returns bigint language sql immutable set search_path = '' as $$
  select pg_catalog.floor(extract(epoch from p_time)*1000)::bigint
$$;
create function sideout.match_view(p_match sideout.matches) returns jsonb language sql stable set search_path = '' as $$
  select pg_catalog.jsonb_build_object('id',p_match.id,
    'status',case when p_match.status = 'pending' and p_match.expires_at <= pg_catalog.now() then 'cancelled' else p_match.status end,
    'teams',p_match.teams,'createdBy',p_match.created_by,'createdAt',sideout.millis(p_match.created_at),
    'reportedBy',p_match.reported_by,'completedAt',sideout.millis(p_match.completed_at),
    'winnerSide',p_match.winner_side,'preview',sideout.preview(p_match.teams),'deltas',p_match.deltas)
$$;
create function sideout.teams(p_a sideout.duos,p_b sideout.duos) returns jsonb language sql stable set search_path = '' as $$
  select pg_catalog.jsonb_build_object('a',pg_catalog.jsonb_build_array(sideout.player_view(p_a.player_a),sideout.player_view(p_a.player_b)),
    'b',pg_catalog.jsonb_build_array(sideout.player_view(p_b.player_a),sideout.player_view(p_b.player_b)))
$$;

create function sideout.play_view(p_id uuid) returns jsonb language sql stable set search_path = '' as $$
  select pg_catalog.jsonb_build_object('player',sideout.player_view(p_id),'duo',sideout.duo_view(sideout.duo_for(p_id)),
    'invitations',coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',i.id,'from',sideout.player_view(i.from_id),'expiresAt',sideout.millis(i.expires_at)) order by i.created_at desc)
      from (select n.* from sideout.invitations n join sideout.profiles f on f.user_id = n.from_id
        where n.to_id = p_id and n.status = 'pending' and n.expires_at > pg_catalog.now()
        and f.data->'avatarCreated' = 'true'::jsonb and sideout.duo_for(n.from_id) is null and sideout.duo_for(p_id) is null
        order by n.created_at desc limit 20) i),'[]'::jsonb),
    'matches',coalesce((select pg_catalog.jsonb_agg(sideout.match_view(m::sideout.matches) order by m.created_at desc,m.id desc)
      from (select n.* from sideout.matches n where p_id in(n.player_a1,n.player_a2,n.player_b1,n.player_b2) order by n.created_at desc,n.id desc limit 20) m),'[]'::jsonb),
    'history',coalesce((select pg_catalog.jsonb_agg(sideout.match_view(m::sideout.matches) order by m.completed_at desc,m.id desc)
      from (select n.* from sideout.matches n where n.status = 'completed' and p_id in(n.player_a1,n.player_a2,n.player_b1,n.player_b2) order by n.completed_at desc,n.id desc limit 20) m),'[]'::jsonb))
$$;

create function public.sideout_profile() returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_id uuid := sideout.me(); v_profile jsonb;
begin
  perform sideout.ensure(v_id);
  select f.data into v_profile from sideout.profiles f where f.user_id = v_id;
  return v_profile;
end $$;
create function public.sideout_save_profile(p_profile jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_id uuid := sideout.me(); v_before jsonb; v_next jsonb;
begin
  if pg_catalog.jsonb_typeof(p_profile) is distinct from 'object' then raise exception 'Please send valid form data.'; end if;
  if pg_catalog.octet_length(p_profile::text) > 16384 then raise exception 'Request is too large.'; end if;
  perform sideout.ensure(v_id);
  perform sideout.lock_players(array[v_id]);
  select f.data into v_before from sideout.profiles f where f.user_id = v_id for update;
  v_next := v_before || p_profile;
  if p_profile ? 'characterType' and p_profile->>'characterType' is distinct from v_before->>'characterType' and not (p_profile ? 'hairStyle') then
    v_next := pg_catalog.jsonb_set(v_next,'{hairStyle}',pg_catalog.to_jsonb(case when v_next->>'characterType' = 'female' then 'ponytail' else 'short' end));
  end if;
  v_next := sideout.validate_profile(v_next);
  update sideout.profiles set data = v_next,updated_at = pg_catalog.now() where user_id = v_id;
  return pg_catalog.jsonb_build_object('ok',true);
end $$;
create function public.sideout_play() returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_id uuid := sideout.me();
begin perform sideout.ready(v_id); return sideout.play_view(v_id); end $$;
create function public.sideout_player(p_code text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_id uuid := sideout.me(); v_target uuid;
begin
  perform sideout.ready(v_id); v_target := sideout.code_player(p_code);
  return pg_catalog.jsonb_build_object('player',sideout.player_view(v_target),'duo',sideout.duo_view(sideout.duo_for(v_target)));
end $$;

create function public.sideout_duo_invite(p_code text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_id uuid := sideout.me(); v_target uuid;
begin
  perform sideout.ready(v_id); v_target := sideout.code_player(p_code);
  if v_id = v_target then raise exception 'Choose another player for your duo.'; end if;
  perform sideout.lock_players(array[v_id,v_target]);
  perform sideout.ready(v_id); perform sideout.ready(v_target);
  if sideout.duo_for(v_id) is not null or sideout.duo_for(v_target) is not null then
    raise exception 'A player is already in a duo. Leave the current duo before choosing a new partner.';
  end if;
  perform sideout.free(array[v_id,v_target]);
  if exists(select 1 from sideout.invitations i where i.status = 'pending' and i.expires_at > pg_catalog.now() and
    ((i.from_id = v_id and i.to_id = v_target) or (i.from_id = v_target and i.to_id = v_id))) then
    raise exception 'A duo invitation between you is already waiting for an answer.';
  end if;
  if (select pg_catalog.count(*) from sideout.invitations i where i.from_id = v_id and i.status = 'pending' and i.expires_at > pg_catalog.now()) >= 10 then
    raise exception 'You already have 10 pending duo invitations. Wait for an answer before inviting more players.';
  end if;
  insert into sideout.invitations(from_id,to_id) values(v_id,v_target);
  return sideout.play_view(v_id);
end $$;

create function public.sideout_duo_respond(p_id uuid,p_accept boolean) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_id uuid := sideout.me(); v_invite sideout.invitations; v_duo uuid;
begin
  perform sideout.ready(v_id);
  if p_accept is null then raise exception 'Choose whether to accept the invitation.'; end if;
  select i.* into v_invite from sideout.invitations i where i.id = p_id;
  if not found then raise exception 'Invitation not found.' using errcode = 'P0002'; end if;
  if v_invite.to_id <> v_id then raise exception 'Only the invited player can answer.' using errcode = '42501'; end if;
  perform sideout.lock_players(array[v_invite.from_id,v_invite.to_id]);
  select i.* into v_invite from sideout.invitations i where i.id = p_id for update;
  if v_invite.status <> 'pending' or v_invite.expires_at <= pg_catalog.now() then raise exception 'This invitation has already been answered or expired.'; end if;
  if not p_accept then
    update sideout.invitations set status = 'declined' where id = p_id;
    return sideout.play_view(v_id);
  end if;
  perform sideout.ready(v_invite.from_id); perform sideout.ready(v_invite.to_id);
  if sideout.duo_for(v_invite.from_id) is not null or sideout.duo_for(v_invite.to_id) is not null then raise exception 'A player is already in another duo.'; end if;
  perform sideout.free(array[v_invite.from_id,v_invite.to_id]);
  insert into sideout.duos(player_a,player_b) values(v_invite.from_id,v_invite.to_id) returning id into v_duo;
  insert into sideout.duo_members(user_id,duo_id) values(v_invite.from_id,v_duo),(v_invite.to_id,v_duo);
  update sideout.invitations set status = 'accepted' where id = p_id;
  update sideout.invitations set status = 'cancelled' where status = 'pending' and
    (from_id in(v_invite.from_id,v_invite.to_id) or to_id in(v_invite.from_id,v_invite.to_id));
  return sideout.play_view(v_id);
end $$;

create function public.sideout_duo_leave() returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_id uuid := sideout.me(); v_duo sideout.duos;
begin
  perform sideout.ready(v_id);
  select d.* into v_duo from sideout.duos d where d.id = sideout.duo_for(v_id);
  if not found then raise exception 'You are not currently in a duo.'; end if;
  perform sideout.lock_players(array[v_duo.player_a,v_duo.player_b]);
  if sideout.duo_for(v_id) is distinct from v_duo.id then raise exception 'Your duo changed. Refresh and try again.'; end if;
  perform sideout.free(array[v_duo.player_a,v_duo.player_b]);
  delete from sideout.duo_members where duo_id = v_duo.id;
  update sideout.duos set dissolved_at = pg_catalog.now() where id = v_duo.id;
  return sideout.play_view(v_id);
end $$;

create function public.sideout_match_create(p_code text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_id uuid := sideout.me(); v_target uuid; v_a sideout.duos; v_b sideout.duos; v_ids uuid[]; v_player uuid;
begin
  perform sideout.ready(v_id); v_target := sideout.code_player(p_code);
  select d.* into v_a from sideout.duos d where d.id = sideout.duo_for(v_id);
  select d.* into v_b from sideout.duos d where d.id = sideout.duo_for(v_target);
  if v_a.id is null or v_b.id is null then raise exception 'Both sides must form a duo before playing doubles.'; end if;
  if v_a.id = v_b.id then raise exception 'Challenge a player from a different duo.'; end if;
  v_ids := array[v_a.player_a,v_a.player_b,v_b.player_a,v_b.player_b];
  perform sideout.lock_players(v_ids);
  if sideout.duo_for(v_id) is distinct from v_a.id or sideout.duo_for(v_target) is distinct from v_b.id then raise exception 'The original duos are no longer available.'; end if;
  foreach v_player in array v_ids loop perform sideout.ready(v_player); end loop;
  perform sideout.free(v_ids);
  insert into sideout.matches(duo_a,duo_b,player_a1,player_a2,player_b1,player_b2,teams,created_by)
  values(v_a.id,v_b.id,v_a.player_a,v_a.player_b,v_b.player_a,v_b.player_b,sideout.teams(v_a,v_b),v_id);
  return sideout.play_view(v_id);
end $$;

create function sideout.lock_match(p_id uuid,p_user uuid) returns sideout.matches language plpgsql set search_path = '' as $$
declare v_match sideout.matches;
begin
  select m.* into v_match from sideout.matches m where m.id = p_id;
  if not found then raise exception 'Game not found.' using errcode = 'P0002'; end if;
  if p_user not in(v_match.player_a1,v_match.player_a2,v_match.player_b1,v_match.player_b2) then raise exception 'Only players in this game can change it.' using errcode = '42501'; end if;
  perform sideout.lock_players(array[v_match.player_a1,v_match.player_a2,v_match.player_b1,v_match.player_b2]);
  select m.* into v_match from sideout.matches m where m.id = p_id for update;
  return v_match;
end $$;

create function public.sideout_match_respond(p_id uuid,p_accept boolean) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_id uuid := sideout.me(); v_match sideout.matches; v_a sideout.duos; v_b sideout.duos; v_player uuid;
begin
  perform sideout.ready(v_id); if p_accept is null then raise exception 'Choose whether to accept the game.'; end if;
  v_match := sideout.lock_match(p_id,v_id);
  if v_match.status <> 'pending' or v_match.expires_at <= pg_catalog.now() then raise exception 'This game is no longer waiting for an answer.'; end if;
  if v_id not in(v_match.player_b1,v_match.player_b2) then raise exception 'A player from the challenged duo must answer.' using errcode = '42501'; end if;
  if not p_accept then
    update sideout.matches set status = 'cancelled' where id = p_id;
    return sideout.play_view(v_id);
  end if;
  if sideout.duo_for(v_match.player_a1) is distinct from v_match.duo_a or sideout.duo_for(v_match.player_b1) is distinct from v_match.duo_b then raise exception 'The original duos are no longer available.'; end if;
  foreach v_player in array array[v_match.player_a1,v_match.player_a2,v_match.player_b1,v_match.player_b2] loop perform sideout.ready(v_player); end loop;
  select d.* into v_a from sideout.duos d where d.id = v_match.duo_a;
  select d.* into v_b from sideout.duos d where d.id = v_match.duo_b;
  update sideout.matches set status = 'active',teams = sideout.teams(v_a,v_b) where id = p_id;
  return sideout.play_view(v_id);
end $$;

create function public.sideout_match_cancel(p_id uuid) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_id uuid := sideout.me(); v_match sideout.matches;
begin
  perform sideout.ready(v_id); v_match := sideout.lock_match(p_id,v_id);
  if v_match.status not in('pending','active') then raise exception 'This game is already finished.'; end if;
  update sideout.matches set status = 'cancelled' where id = p_id;
  return sideout.play_view(v_id);
end $$;

create function public.sideout_match_result(p_id uuid,p_winner text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_id uuid := sideout.me(); v_match sideout.matches; v_award integer; v_side text; v_member jsonb; v_player uuid;
  v_before bigint; v_after bigint; v_deltas jsonb := '[]'::jsonb; v_changed integer;
begin
  perform sideout.ready(v_id);
  if p_winner is null or p_winner not in('a','b') then raise exception 'Choose the duo that won.'; end if;
  v_match := sideout.lock_match(p_id,v_id);
  if v_match.status <> 'active' then raise exception 'Accept the game before submitting a result. Finished games cannot be submitted twice.'; end if;
  v_award := (sideout.preview(v_match.teams)->>p_winner)::integer;
  foreach v_side in array array['a','b'] loop
    for v_member in select e.value from pg_catalog.jsonb_array_elements(v_match.teams->v_side) e loop
      v_player := (v_member->>'id')::uuid; v_before := (v_member->>'rating')::bigint;
      v_after := greatest(100::bigint,v_before + case when v_side = p_winner then v_award else -v_award end);
      update sideout.players set rating = v_after,games = games+1,wins = wins + case when v_side = p_winner then 1 else 0 end
      where user_id = v_player and rating = v_before;
      get diagnostics v_changed = row_count;
      if v_changed <> 1 then raise exception 'A player rating changed. Cancel this game and create a new one.'; end if;
      v_deltas := v_deltas || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('playerId',v_player,'before',v_before,'after',v_after,'delta',v_after-v_before));
    end loop;
  end loop;
  update sideout.matches set status = 'completed',reported_by = v_id,completed_at = pg_catalog.now(),winner_side = p_winner,deltas = v_deltas where id = p_id;
  return sideout.play_view(v_id);
end $$;

-- New private helpers are never callable directly by web clients.
revoke all on all functions in schema sideout from public, anon, authenticated;
-- Do not change privileges on unrelated public functions.
revoke all on function public.sideout_profile() from public, anon, authenticated;
revoke all on function public.sideout_save_profile(jsonb) from public, anon, authenticated;
revoke all on function public.sideout_play() from public, anon, authenticated;
revoke all on function public.sideout_player(text) from public, anon, authenticated;
revoke all on function public.sideout_duo_invite(text) from public, anon, authenticated;
revoke all on function public.sideout_duo_respond(uuid,boolean) from public, anon, authenticated;
revoke all on function public.sideout_duo_leave() from public, anon, authenticated;
revoke all on function public.sideout_match_create(text) from public, anon, authenticated;
revoke all on function public.sideout_match_respond(uuid,boolean) from public, anon, authenticated;
revoke all on function public.sideout_match_cancel(uuid) from public, anon, authenticated;
revoke all on function public.sideout_match_result(uuid,text) from public, anon, authenticated;
grant execute on function public.sideout_profile(),public.sideout_save_profile(jsonb),public.sideout_play(),public.sideout_player(text),
  public.sideout_duo_invite(text),public.sideout_duo_respond(uuid,boolean),public.sideout_duo_leave(),public.sideout_match_create(text),
  public.sideout_match_respond(uuid,boolean),public.sideout_match_cancel(uuid),public.sideout_match_result(uuid,text) to authenticated;
