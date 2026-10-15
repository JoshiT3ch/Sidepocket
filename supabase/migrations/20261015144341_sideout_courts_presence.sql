-- Community-maintained courts and explicitly opted-in, temporary presence.
-- No GPS, Google Places data, email, or unrestricted client table access.
create table sideout.courts (
  id text primary key,
  name text not null,
  address text not null,
  maps_url text not null check (maps_url like 'https://www.google.com/maps/search/?api=1&query=%'),
  sort_order integer not null unique
);
insert into sideout.courts(id,name,address,maps_url,sort_order) values
  ('paddle-grove','Paddle Grove','Purok 17, Hindangon','https://www.google.com/maps/search/?api=1&query=Paddle%20Grove%20Purok%2017%2C%20Hindangon%2C%20Valencia%20City%2C%20Bukidnon%2C%20Philippines',0),
  ('jerpits-pickleball-hub','Jerpits Pickleball Hub','Purok 17A, Hagkol','https://www.google.com/maps/search/?api=1&query=Jerpits%20Pickleball%20Hub%20Purok%2017A%2C%20Hagkol%2C%20Valencia%20City%2C%20Bukidnon%2C%20Philippines',1),
  ('hive-pickleball-court','Hive Pickleball Court','W34W+52F','https://www.google.com/maps/search/?api=1&query=Hive%20Pickleball%20Court%20W34W%2B52F%2C%20Valencia%20City%2C%20Bukidnon%2C%20Philippines',2),
  ('acp-pickleball','ACP Pickleball','Purok 17, Hindangon','https://www.google.com/maps/search/?api=1&query=ACP%20Pickleball%20Purok%2017%2C%20Hindangon%2C%20Valencia%20City%2C%20Bukidnon%2C%20Philippines',3),
  ('pickle-point-arena-bukidnon','Pickle Point Arena Bukidnon','Purok 4, Guinoyuran Rd','https://www.google.com/maps/search/?api=1&query=Pickle%20Point%20Arena%20Bukidnon%20Purok%204%2C%20Guinoyuran%20Rd%2C%20Valencia%20City%2C%20Bukidnon%2C%20Philippines',4),
  ('spinners-pickle-yard','Spinners Pickle Yard','Purok 15, NIA Road','https://www.google.com/maps/search/?api=1&query=Spinners%20Pickle%20Yard%20Purok%2015%2C%20NIA%20Road%2C%20Valencia%20City%2C%20Bukidnon%2C%20Philippines',5),
  ('valencia-goodwill-giants-sports-town','VALENCIA GOODWILL GIANTS SPORTS TOWN','W423+H4J','https://www.google.com/maps/search/?api=1&query=VALENCIA%20GOODWILL%20GIANTS%20SPORTS%20TOWN%20W423%2BH4J%2C%20Valencia%20City%2C%20Bukidnon%2C%20Philippines',6),
  ('the-bodega','The Bodega','A Bonifacio St','https://www.google.com/maps/search/?api=1&query=The%20Bodega%20A%20Bonifacio%20St%2C%20Valencia%20City%2C%20Bukidnon%2C%20Philippines',7);
create table sideout.court_checkins (
  user_id uuid primary key references sideout.players(user_id) on delete cascade,
  court_id text not null references sideout.courts(id),
  status text not null check (status in ('playing','idle','practice')),
  open_play boolean not null,
  checked_in_at timestamptz not null,
  updated_at timestamptz not null,
  expires_at timestamptz not null,
  check (checked_in_at <= updated_at),
  check (expires_at = updated_at + interval '2 hours')
);
create index sideout_court_checkins_court_expiry on sideout.court_checkins(court_id,expires_at,updated_at desc,user_id);
alter table sideout.courts enable row level security;
alter table sideout.court_checkins enable row level security;
revoke all on table sideout.courts,sideout.court_checkins from public,anon,authenticated;

-- Snapshot helper is callable only by authenticated gateways below. Capture one
-- server time for expiry, counts and roster consistency; reads never renew it.
create function sideout.courts_view(p_id uuid,p_court_id text,p_now timestamptz)
returns jsonb language sql stable set search_path = '' as $$
  select pg_catalog.jsonb_build_object(
    'courts',coalesce((select pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object('id',c.id,'name',c.name,'address',c.address,'mapsUrl',c.maps_url,
        'playerCount',coalesce(a.players,0),'openPlayCount',coalesce(a.open_players,0)) order by c.sort_order)
      from sideout.courts c left join (
        select k.court_id,pg_catalog.count(*) as players,pg_catalog.count(*) filter (where k.open_play) as open_players
        from sideout.court_checkins k where k.expires_at > p_now group by k.court_id
      ) a on a.court_id = c.id),'[]'::jsonb),
    'selectedCourtId',p_court_id,
    'players',coalesce((select pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object('player',sideout.player_view(k.user_id),'status',k.status,'openPlay',k.open_play,
        'checkedInAt',sideout.millis(k.checked_in_at),'updatedAt',sideout.millis(k.updated_at),'expiresAt',sideout.millis(k.expires_at))
        order by (k.user_id = p_id) desc,k.updated_at desc,k.user_id)
      from (select n.* from sideout.court_checkins n
        where n.court_id = p_court_id and n.expires_at > p_now
        order by (n.user_id = p_id) desc,n.updated_at desc,n.user_id limit 100) k),'[]'::jsonb),
    'me',pg_catalog.jsonb_build_object('player',sideout.player_view(p_id),
      'checkIn',(select pg_catalog.jsonb_build_object('courtId',m.court_id,'status',m.status,'openPlay',m.open_play,
        'checkedInAt',sideout.millis(m.checked_in_at),'updatedAt',sideout.millis(m.updated_at),'expiresAt',sideout.millis(m.expires_at))
        from sideout.court_checkins m where m.user_id = p_id and m.expires_at > p_now)),
    'serverTime',sideout.millis(p_now),'ttlMinutes',120,'rosterLimit',100)
$$;

create function sideout.court_validate(p_court_id text,p_optional boolean default false)
returns void language plpgsql stable set search_path = '' as $$
begin
  if p_optional and p_court_id is null then return; end if;
  if p_court_id is null or not exists(select 1 from sideout.courts c where c.id = p_court_id) then
    raise exception 'Court not found. Choose a court from the list.' using errcode = 'P0002';
  end if;
end $$;

create function public.sideout_courts(p_court_id text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_id uuid := sideout.me();
begin
  perform sideout.ensure(v_id);
  perform sideout.court_validate(p_court_id,true);
  return sideout.courts_view(v_id,p_court_id,pg_catalog.clock_timestamp());
end $$;

create function public.sideout_court_check_in(p_court_id text,p_status text,p_open_play jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_id uuid := sideout.me(); v_now timestamptz;
begin
  perform sideout.ensure(v_id);
  perform sideout.court_validate(p_court_id);
  if p_status is null or p_status <> all(array['playing','idle','practice']) then
    raise exception 'Choose Playing, Idle, or Practicing.';
  end if;
  if pg_catalog.jsonb_typeof(p_open_play) is distinct from 'boolean' then raise exception 'Choose whether you are available for open play.'; end if;
  -- Serialize changes for this account, including move/leave races.
  perform sideout.lock_players(array[v_id]);
  if (select f.data->'avatarCreated' from sideout.profiles f where f.user_id = v_id) is distinct from 'true'::jsonb then
    raise exception 'Create your avatar before checking in to a court.';
  end if;
  v_now := pg_catalog.clock_timestamp();
  insert into sideout.court_checkins(user_id,court_id,status,open_play,checked_in_at,updated_at,expires_at)
  values(v_id,p_court_id,p_status,(p_open_play #>> '{}')::boolean,v_now,v_now,v_now+interval '2 hours')
  on conflict(user_id) do update set
    checked_in_at = case when sideout.court_checkins.court_id = excluded.court_id and sideout.court_checkins.expires_at > v_now
      then sideout.court_checkins.checked_in_at else excluded.checked_in_at end,
    court_id = excluded.court_id,status = excluded.status,open_play = excluded.open_play,
    updated_at = excluded.updated_at,expires_at = excluded.expires_at;
  return sideout.courts_view(v_id,p_court_id,v_now);
end $$;

create function public.sideout_court_leave(p_court_id text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_id uuid := sideout.me();
begin
  perform sideout.ensure(v_id);
  -- Validate the selected UI court before deleting anything.
  perform sideout.court_validate(p_court_id,true);
  perform sideout.lock_players(array[v_id]);
  delete from sideout.court_checkins where user_id = v_id;
  return sideout.courts_view(v_id,p_court_id,pg_catalog.clock_timestamp());
end $$;

revoke all on function sideout.courts_view(uuid,text,timestamptz),sideout.court_validate(text,boolean) from public,anon,authenticated;
revoke all on function public.sideout_courts(text),public.sideout_court_check_in(text,text,jsonb),public.sideout_court_leave(text) from public,anon,authenticated;
grant execute on function public.sideout_courts(text),public.sideout_court_check_in(text,text,jsonb),public.sideout_court_leave(text) to authenticated;
