-- Account-owned friend requests. Friendship never creates duos or changes ratings.
-- Keep each request row after it ends so cancelling/removing cannot reset limits.
create table sideout.friendships (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','declined','cancelled','removed')),
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  check (requester_id <> recipient_id),
  check (updated_at >= created_at)
);
-- The database also enforces the unordered-pair invariant under concurrent writes.
create unique index sideout_friendships_active_pair
  on sideout.friendships(least(requester_id,recipient_id),greatest(requester_id,recipient_id))
  where status in ('pending','accepted');
create index sideout_friendships_requester_created on sideout.friendships(requester_id,created_at desc);
create index sideout_friendships_requester_status on sideout.friendships(requester_id,status,created_at desc,id);
create index sideout_friendships_recipient_status on sideout.friendships(recipient_id,status,created_at desc,id);
create index sideout_friendships_pair_cooldown
  on sideout.friendships(least(requester_id,recipient_id),greatest(requester_id,recipient_id),updated_at desc)
  where status in ('declined','cancelled','removed');
alter table sideout.friendships enable row level security;
revoke all on table sideout.friendships from public,anon,authenticated;

-- Only the authenticated gateways call this helper with their verified account.
-- Player views contain public avatar/rating fields, never email or auth metadata.
create function sideout.friends_view(p_id uuid) returns jsonb
language sql stable set search_path = '' as $$
  select pg_catalog.jsonb_build_object(
    'friends',coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id',f.id,'player',sideout.player_view(case when f.requester_id = p_id then f.recipient_id else f.requester_id end),
      'createdAt',sideout.millis(f.created_at)) order by f.created_at desc,f.id desc)
      from sideout.friendships f where f.status = 'accepted' and p_id in (f.requester_id,f.recipient_id)),'[]'::jsonb),
    'incoming',coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id',f.id,'player',sideout.player_view(f.requester_id),'createdAt',sideout.millis(f.created_at)) order by f.created_at desc,f.id desc)
      from sideout.friendships f where f.status = 'pending' and f.recipient_id = p_id),'[]'::jsonb),
    'outgoing',coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id',f.id,'player',sideout.player_view(f.recipient_id),'createdAt',sideout.millis(f.created_at)) order by f.created_at desc,f.id desc)
      from sideout.friendships f where f.status = 'pending' and f.requester_id = p_id),'[]'::jsonb))
$$;

create function public.sideout_friends() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_id uuid := sideout.me();
begin
  perform sideout.ensure(v_id);
  return sideout.friends_view(v_id);
end $$;

create function public.sideout_friend_request(p_code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_id uuid := sideout.me(); v_target uuid; v_active sideout.friendships; v_now timestamptz;
begin
  perform sideout.ready(v_id);
  v_target := sideout.code_player(p_code);
  if v_target = v_id then raise exception 'You cannot send a friend request to yourself.'; end if;
  -- Use the same ordered player locks as existing duo/profile writes. This also
  -- serializes all outgoing requests for an account before counting its limits.
  perform sideout.lock_players(array[v_id,v_target]);
  perform sideout.ready(v_id); perform sideout.ready(v_target);
  v_now := pg_catalog.clock_timestamp();
  select f.* into v_active from sideout.friendships f
  where least(f.requester_id,f.recipient_id) = least(v_id,v_target)
    and greatest(f.requester_id,f.recipient_id) = greatest(v_id,v_target)
    and f.status in ('pending','accepted') for update;
  if found then
    if v_active.status = 'pending' and v_active.recipient_id = v_id then
      raise exception 'This player has already sent you a request. Accept it in your incoming requests.';
    end if;
    -- A duplicate send/network retry never creates a second request or friendship.
    return sideout.friends_view(v_id);
  end if;
  if exists(select 1 from sideout.friendships f
    where least(f.requester_id,f.recipient_id) = least(v_id,v_target)
      and greatest(f.requester_id,f.recipient_id) = greatest(v_id,v_target)
      and f.status in ('declined','cancelled','removed') and f.updated_at > v_now - interval '24 hours') then
    raise exception 'Please wait 24 hours before sending this player another friend request.';
  end if;
  if (select pg_catalog.count(*) from sideout.friendships f
      where f.requester_id = v_id and f.created_at > v_now - interval '1 hour') >= 20 then
    raise exception 'You can send up to 20 friend requests per hour. Please try again later.';
  end if;
  if (select pg_catalog.count(*) from sideout.friendships f
      where f.requester_id = v_id and f.status = 'pending') >= 20 then
    raise exception 'You already have 20 pending friend requests. Cancel one before sending another.';
  end if;
  insert into sideout.friendships(requester_id,recipient_id,created_at,updated_at)
  values(v_id,v_target,v_now,v_now);
  return sideout.friends_view(v_id);
end $$;

create function public.sideout_friend_respond(p_id uuid,p_accept boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_id uuid := sideout.me(); v_request sideout.friendships; v_status text;
begin
  perform sideout.ensure(v_id);
  if p_accept is null then raise exception 'Choose whether to accept or decline this friend request.'; end if;
  select f.* into v_request from sideout.friendships f where f.id = p_id and f.recipient_id = v_id;
  if not found then raise exception 'Friend request not found.' using errcode = 'P0002'; end if;
  perform sideout.lock_players(array[v_id,v_request.requester_id]);
  select f.* into v_request from sideout.friendships f where f.id = p_id and f.recipient_id = v_id for update;
  if not found then raise exception 'Friend request not found.' using errcode = 'P0002'; end if;
  v_status := case when p_accept then 'accepted' else 'declined' end;
  if v_request.status = v_status then return sideout.friends_view(v_id); end if;
  if v_request.status <> 'pending' then raise exception 'This friend request is no longer pending.'; end if;
  if p_accept then perform sideout.ready(v_id); perform sideout.ready(v_request.requester_id); end if;
  update sideout.friendships set status = v_status,updated_at = pg_catalog.clock_timestamp() where id = p_id;
  return sideout.friends_view(v_id);
end $$;

create function public.sideout_friend_cancel(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_id uuid := sideout.me(); v_request sideout.friendships;
begin
  perform sideout.ensure(v_id);
  select f.* into v_request from sideout.friendships f where f.id = p_id and f.requester_id = v_id;
  if not found then raise exception 'Friend request not found.' using errcode = 'P0002'; end if;
  perform sideout.lock_players(array[v_id,v_request.recipient_id]);
  select f.* into v_request from sideout.friendships f where f.id = p_id and f.requester_id = v_id for update;
  if not found then raise exception 'Friend request not found.' using errcode = 'P0002'; end if;
  if v_request.status = 'cancelled' then return sideout.friends_view(v_id); end if;
  if v_request.status <> 'pending' then raise exception 'Only pending friend requests can be cancelled.'; end if;
  update sideout.friendships set status = 'cancelled',updated_at = pg_catalog.clock_timestamp() where id = p_id;
  return sideout.friends_view(v_id);
end $$;

create function public.sideout_friend_remove(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_id uuid := sideout.me(); v_request sideout.friendships; v_other uuid;
begin
  perform sideout.ensure(v_id);
  select f.* into v_request from sideout.friendships f where f.id = p_id and v_id in (f.requester_id,f.recipient_id);
  if not found then raise exception 'Friend not found.' using errcode = 'P0002'; end if;
  v_other := case when v_request.requester_id = v_id then v_request.recipient_id else v_request.requester_id end;
  perform sideout.lock_players(array[v_id,v_other]);
  select f.* into v_request from sideout.friendships f where f.id = p_id and v_id in (f.requester_id,f.recipient_id) for update;
  if not found then raise exception 'Friend not found.' using errcode = 'P0002'; end if;
  if v_request.status = 'removed' then return sideout.friends_view(v_id); end if;
  if v_request.status <> 'accepted' then raise exception 'Accept a friend request before removing the friendship.'; end if;
  update sideout.friendships set status = 'removed',updated_at = pg_catalog.clock_timestamp() where id = p_id;
  return sideout.friends_view(v_id);
end $$;

revoke all on function sideout.friends_view(uuid) from public,anon,authenticated;
revoke all on function public.sideout_friends(),public.sideout_friend_request(text),public.sideout_friend_respond(uuid,boolean),
  public.sideout_friend_cancel(uuid),public.sideout_friend_remove(uuid) from public,anon,authenticated;
grant execute on function public.sideout_friends(),public.sideout_friend_request(text),public.sideout_friend_respond(uuid,boolean),
  public.sideout_friend_cancel(uuid),public.sideout_friend_remove(uuid) to authenticated;
