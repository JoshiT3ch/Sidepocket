-- Temporary, manually selected status/court sharing with accepted friends.
-- Private by default. No GPS, automatic online state, or last-seen tracking.
create table sideout.friend_presence (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null default 'available' check (status in ('available','playing','practice','away')),
  court_id text references sideout.courts(id),
  share_status boolean not null default false,
  share_location boolean not null default false,
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  expires_at timestamptz,
  check (not share_location or court_id is not null),
  check ((share_status or share_location) = (expires_at is not null)),
  check (expires_at is null or expires_at = updated_at + interval '2 hours')
);
create index sideout_friend_presence_court on sideout.friend_presence(court_id);
alter table sideout.friend_presence enable row level security;
revoke all on table sideout.friend_presence from public,anon,authenticated;

-- Gateways provide their authenticated viewer, but the helper also checks the
-- accepted relationship. Hidden/expired data produces SQL NULL with no times.
create function sideout.friend_presence_view(p_viewer uuid,p_owner uuid,p_now timestamptz)
returns jsonb language sql stable set search_path = '' as $$
  select pg_catalog.jsonb_build_object(
    'status',case when p.share_status then p.status else null end,
    'court',case when p.share_location then pg_catalog.jsonb_build_object('id',c.id,'name',c.name) else null end,
    'expiresAt',sideout.millis(p.expires_at))
  from sideout.friend_presence p
  left join sideout.courts c on c.id = p.court_id
  where p.user_id = p_owner and p.expires_at > p_now and (p.share_status or p.share_location)
    and exists(select 1 from sideout.friendships f where f.status = 'accepted'
      and ((f.requester_id = p_viewer and f.recipient_id = p_owner)
        or (f.requester_id = p_owner and f.recipient_id = p_viewer)))
$$;

-- Preserve the original helper signature, so every existing Friends gateway
-- returns the expanded snapshot. Capture a single clock value for all fields.
create or replace function sideout.friends_view(p_id uuid) returns jsonb
language plpgsql set search_path = '' as $$
declare v_now timestamptz := pg_catalog.clock_timestamp();
begin
  return pg_catalog.jsonb_build_object(
    'friends',coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id',f.id,'player',sideout.player_view(case when f.requester_id = p_id then f.recipient_id else f.requester_id end),
      'createdAt',sideout.millis(f.created_at),
      'presence',sideout.friend_presence_view(p_id,case when f.requester_id = p_id then f.recipient_id else f.requester_id end,v_now))
      order by f.created_at desc,f.id desc)
      from sideout.friendships f where f.status = 'accepted' and p_id in (f.requester_id,f.recipient_id)),'[]'::jsonb),
    'incoming',coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id',f.id,'player',sideout.player_view(f.requester_id),'createdAt',sideout.millis(f.created_at)) order by f.created_at desc,f.id desc)
      from sideout.friendships f where f.status = 'pending' and f.recipient_id = p_id),'[]'::jsonb),
    'outgoing',coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id',f.id,'player',sideout.player_view(f.recipient_id),'createdAt',sideout.millis(f.created_at)) order by f.created_at desc,f.id desc)
      from sideout.friendships f where f.status = 'pending' and f.requester_id = p_id),'[]'::jsonb),
    'me',pg_catalog.jsonb_build_object('presence',coalesce((select pg_catalog.jsonb_build_object(
      'status',p.status,'courtId',p.court_id,
      'shareStatus',p.share_status and coalesce(p.expires_at > v_now,false),
      'shareLocation',p.share_location and coalesce(p.expires_at > v_now,false),
      'updatedAt',sideout.millis(p.updated_at),
      'expiresAt',case when p.expires_at > v_now then sideout.millis(p.expires_at) else null end)
      from sideout.friend_presence p where p.user_id = p_id),
      '{"status":"available","courtId":null,"shareStatus":false,"shareLocation":false,"updatedAt":null,"expiresAt":null}'::jsonb)),
    'courts',coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',c.id,'name',c.name) order by c.sort_order)
      from sideout.courts c),'[]'::jsonb),
    'serverTime',sideout.millis(v_now));
end $$;

create function public.sideout_presence_update(p_status text,p_court_id text,p_share_status jsonb,p_share_location jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := sideout.me(); v_now timestamptz; v_share_status boolean; v_share_location boolean;
begin
  perform sideout.ensure(v_id);
  if p_status is null or p_status <> all(array['available','playing','practice','away']) then
    raise exception 'Choose Available, Playing, Practicing, or Away.';
  end if;
  if pg_catalog.jsonb_typeof(p_share_status) is distinct from 'boolean' or
    pg_catalog.jsonb_typeof(p_share_location) is distinct from 'boolean' then
    raise exception 'Choose whether to share your status and court with friends.';
  end if;
  v_share_status := (p_share_status #>> '{}')::boolean;
  v_share_location := (p_share_location #>> '{}')::boolean;
  perform sideout.court_validate(p_court_id,not v_share_location);
  -- Use the same player lock as public check-ins and friendship changes. A hide
  -- and a public check-in are serialized; a later check-in is a new public opt-in.
  perform sideout.lock_players(array[v_id]);
  if (v_share_status or v_share_location) and
    (select p.data->'avatarCreated' from sideout.profiles p where p.user_id = v_id) is distinct from 'true'::jsonb then
    raise exception 'Create your avatar before sharing your status or court.';
  end if;
  v_now := pg_catalog.clock_timestamp();
  insert into sideout.friend_presence(user_id,status,court_id,share_status,share_location,updated_at,expires_at)
  values(v_id,p_status,p_court_id,v_share_status,v_share_location,v_now,
    case when v_share_status or v_share_location then v_now+interval '2 hours' else null end)
  on conflict(user_id) do update set status = excluded.status,court_id = excluded.court_id,
    share_status = excluded.share_status,share_location = excluded.share_location,
    updated_at = excluded.updated_at,expires_at = excluded.expires_at;
  -- Privacy applies to the existing public Courts roster too. Never leave an
  -- earlier public location behind after the player turns location sharing off.
  if not v_share_location then delete from sideout.court_checkins where user_id = v_id; end if;
  return sideout.friends_view(v_id);
end $$;

create function public.sideout_presence_hide() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_id uuid := sideout.me(); v_now timestamptz;
begin
  perform sideout.ensure(v_id);
  perform sideout.lock_players(array[v_id]);
  v_now := pg_catalog.clock_timestamp();
  insert into sideout.friend_presence(user_id,status,court_id,share_status,share_location,updated_at,expires_at)
  values(v_id,'available',null,false,false,v_now,null)
  on conflict(user_id) do update set court_id = null,share_status = false,share_location = false,
    updated_at = excluded.updated_at,expires_at = null;
  delete from sideout.court_checkins where user_id = v_id;
  return sideout.friends_view(v_id);
end $$;

revoke all on function sideout.friend_presence_view(uuid,uuid,timestamptz),sideout.friends_view(uuid) from public,anon,authenticated;
revoke all on function public.sideout_presence_update(text,text,jsonb,jsonb),public.sideout_presence_hide() from public,anon,authenticated;
grant execute on function public.sideout_presence_update(text,text,jsonb,jsonb),public.sideout_presence_hide() to authenticated;
