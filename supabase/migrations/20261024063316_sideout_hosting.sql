-- Verified accounts host scheduled sessions; players request a place and the host confirms it.
-- Existing court applications, bookings, history and verification entitlements remain intact.
create table sideout.hosted_events (
 id uuid primary key default gen_random_uuid(),
 host_id uuid not null references auth.users(id) on delete cascade,
 title text not null check(length(title) between 3 and 100),
 category text not null check(category in ('men','women','mixed','open')),
 capacity integer not null default 30 check(capacity between 2 and 100),
 starts_at timestamptz not null, ends_at timestamptz not null,
 venue text not null check(length(venue) between 3 and 100),
 address text not null check(length(address) between 8 and 250),
 fee integer not null default 0 check(fee between 0 and 10000),
 notes text not null default '' check(length(notes)<=1500),
 status text not null default 'published' check(status in ('published','cancelled')),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 check(ends_at>starts_at and ends_at<=starts_at+interval '12 hours'),
 check((starts_at at time zone 'Asia/Manila')::date=(ends_at at time zone 'Asia/Manila')::date)
);
create index hosted_events_start on sideout.hosted_events(starts_at,id);
create index hosted_events_host on sideout.hosted_events(host_id,starts_at);
create table sideout.hosting_participants (
 event_id uuid not null references sideout.hosted_events(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 status text not null check(status in ('requested','confirmed','maybe','declined')),
 updated_at timestamptz not null default now(),primary key(event_id,user_id)
);
create index hosting_participants_user on sideout.hosting_participants(user_id,event_id);
create index hosting_participants_status on sideout.hosting_participants(event_id,status,updated_at,user_id);
alter table sideout.hosted_events enable row level security;
alter table sideout.hosting_participants enable row level security;
revoke all on sideout.hosted_events,sideout.hosting_participants from public,anon,authenticated;

create function sideout.hosting_event_view(e sideout.hosted_events,p_user uuid) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object('id',e.id,'title',e.title,'category',e.category,'host',sideout.player_view(e.host_id),
  'capacity',e.capacity,'confirmedCount',(select count(*) from sideout.hosting_participants p where p.event_id=e.id and p.status='confirmed'),
  'startsAt',e.starts_at,'endsAt',e.ends_at,'venue',e.venue,'address',e.address,'fee',e.fee,'notes',e.notes,'status',e.status,
  'myStatus',(select p.status from sideout.hosting_participants p where p.event_id=e.id and p.user_id=p_user))
$$;

create function sideout.hosting_api(p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 v_user uuid:=sideout.me();v_now timestamptz:=clock_timestamp();v_verified boolean;
 v_id uuid;v_target uuid;v_event sideout.hosted_events;v_status text;v_next text;
 v_scope text:=coalesce(p_data->>'scope',case when p_action='cancel' then 'mine' else 'upcoming' end);
 v_title text;v_category text;v_venue text;v_address text;v_notes text;v_capacity integer;v_fee integer;
 v_date date;v_start time;v_end time;v_starts timestamptz;v_ends timestamptz;
 v_events jsonb;v_selected jsonb;v_result jsonb;
begin
 perform sideout.ensure(v_user);
 if jsonb_typeof(p_data) is distinct from 'object' then raise exception 'Please send valid form data.';end if;
 if p_action is null or p_action not in ('list','create','edit','request','respond','rsvp','cancel') then raise exception 'This hosting action is not available.';end if;
 if v_scope not in ('upcoming','mine','past') then raise exception 'Choose upcoming, mine, or past sessions.';end if;
 if p_data ? 'eventId' and (jsonb_typeof(p_data->'eventId') is distinct from 'string' or (p_data->>'eventId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then raise exception 'Choose a valid hosted session.';end if;
 v_id:=nullif(p_data->>'eventId','')::uuid;
 v_verified:=exists(select 1 from sideout.player_verifications where user_id=v_user and verified_until>v_now);

 if p_action in ('create','edit') then
  if not v_verified then raise exception 'Verify your account before hosting a session.' using errcode='42501';end if;
  perform sideout.ready(v_user);
  if jsonb_typeof(p_data->'title') is distinct from 'string' or jsonb_typeof(p_data->'venue') is distinct from 'string' or jsonb_typeof(p_data->'address') is distinct from 'string' or (p_data ? 'notes' and jsonb_typeof(p_data->'notes') is distinct from 'string') then raise exception 'Enter a title, venue and address.';end if;
  v_title:=btrim(p_data->>'title');v_venue:=btrim(p_data->>'venue');v_address:=btrim(p_data->>'address');v_notes:=btrim(coalesce(p_data->>'notes',''));v_category:=p_data->>'category';
  if length(v_title) not between 3 and 100 or length(v_venue) not between 3 and 100 or length(v_address) not between 8 and 250 or length(v_notes)>1500 then raise exception 'Check the title, venue, address and notes lengths.';end if;
  if v_category is null or v_category not in ('men','women','mixed','open') then raise exception 'Choose a session category.';end if;
  if p_data ? 'capacity' and (jsonb_typeof(p_data->'capacity') is distinct from 'number') then raise exception 'Choose a capacity between 2 and 100 players.';end if;
  if p_data ? 'fee' and (jsonb_typeof(p_data->'fee') is distinct from 'number') then raise exception 'Enter a whole-peso fee between 0 and 10000.';end if;
  if coalesce((p_data->>'capacity')::numeric,30) not between 2 and 100 or coalesce((p_data->>'capacity')::numeric,30)<>trunc(coalesce((p_data->>'capacity')::numeric,30)) then raise exception 'Choose a capacity between 2 and 100 players.';end if;
  if coalesce((p_data->>'fee')::numeric,0) not between 0 and 10000 or coalesce((p_data->>'fee')::numeric,0)<>trunc(coalesce((p_data->>'fee')::numeric,0)) then raise exception 'Enter a whole-peso fee between 0 and 10000.';end if;
  v_capacity:=coalesce((p_data->>'capacity')::integer,30);v_fee:=coalesce((p_data->>'fee')::integer,0);
  if coalesce(p_data->>'date','') !~ '^\d{4}-\d{2}-\d{2}$' or coalesce(p_data->>'startTime','') !~ '^([01]\d|2[0-3]):[0-5]\d$' or coalesce(p_data->>'endTime','') !~ '^([01]\d|2[0-3]):[0-5]\d$' then raise exception 'Choose a valid date and start/end time.';end if;
  begin v_date:=(p_data->>'date')::date;v_start:=(p_data->>'startTime')::time;v_end:=(p_data->>'endTime')::time;
  exception when datetime_field_overflow or invalid_datetime_format then raise exception 'Choose a valid calendar date.';end;
  v_starts:=(v_date+v_start) at time zone 'Asia/Manila';v_ends:=(v_date+v_end) at time zone 'Asia/Manila';
  if v_starts<=v_now or v_starts>v_now+interval '1 year' or v_ends<=v_starts or v_ends>v_starts+interval '12 hours' then raise exception 'Choose a future session within one year, ending the same day and lasting at most 12 hours.';end if;
  if p_action='create' then
   insert into sideout.hosted_events(host_id,title,category,capacity,starts_at,ends_at,venue,address,fee,notes,created_at,updated_at)
   values(v_user,v_title,v_category,v_capacity,v_starts,v_ends,v_venue,v_address,v_fee,v_notes,v_now,v_now) returning id into v_id;
   insert into sideout.hosting_participants(event_id,user_id,status,updated_at) values(v_id,v_user,'confirmed',v_now);
  else
   select * into v_event from sideout.hosted_events where id=v_id for update;
   if not found then raise exception 'This hosted session is unavailable.' using errcode='P0002';end if;
   if v_event.host_id<>v_user then raise exception 'Only the host can edit this session.' using errcode='42501';end if;
   if v_event.status<>'published' or v_event.starts_at<=v_now then raise exception 'Only upcoming published sessions can be edited.';end if;
   if v_capacity<(select count(*) from sideout.hosting_participants where event_id=v_id and status='confirmed') then raise exception 'Capacity cannot be lower than the confirmed player count.';end if;
   update sideout.hosted_events set title=v_title,category=v_category,capacity=v_capacity,starts_at=v_starts,ends_at=v_ends,venue=v_venue,address=v_address,fee=v_fee,notes=v_notes,updated_at=v_now where id=v_id;
  end if;
 elsif p_action<>'list' then
  -- Every membership/capacity mutation takes this same lock before observing counts.
  select * into v_event from sideout.hosted_events where id=v_id for update;
  if not found then raise exception 'This hosted session is unavailable.' using errcode='P0002';end if;
  select status into v_status from sideout.hosting_participants where event_id=v_id and user_id=v_user;
  if p_action='cancel' then
   if v_event.host_id<>v_user then raise exception 'Only the host can cancel this session.' using errcode='42501';end if;
   if v_event.status<>'cancelled' and v_event.ends_at<=v_now then raise exception 'This session has already ended.';end if;
   update sideout.hosted_events set status='cancelled',updated_at=v_now where id=v_id;
  else
   if v_event.status<>'published' or v_event.ends_at<=v_now then raise exception 'This session has ended or was cancelled.';end if;
   if p_action='request' then
    perform sideout.ready(v_user);
    if coalesce(v_status,'') not in ('requested','confirmed') then
     if (select count(*) from sideout.hosting_participants where event_id=v_id and status='confirmed')>=v_event.capacity then raise exception 'This session is full.';end if;
     insert into sideout.hosting_participants(event_id,user_id,status,updated_at) values(v_id,v_user,'requested',v_now)
     on conflict(event_id,user_id) do update set status='requested',updated_at=excluded.updated_at;
    end if;
   elsif p_action='respond' then
    if v_event.host_id<>v_user then raise exception 'Only the host can respond to join requests.' using errcode='42501';end if;
    if jsonb_typeof(p_data->'accept') is distinct from 'boolean' or jsonb_typeof(p_data->'userId') is distinct from 'string' or (p_data->>'userId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'Choose a player request and accept or decline.';end if;
    v_target:=(p_data->>'userId')::uuid;v_next:=case when (p_data->>'accept')::boolean then 'confirmed' else 'declined' end;
    if v_target=v_user then raise exception 'The host stays confirmed in this session.';end if;
    select status into v_status from sideout.hosting_participants where event_id=v_id and user_id=v_target;
    if v_status is distinct from v_next then
     if v_status is distinct from 'requested' then raise exception 'This join request is no longer pending.';end if;
     if v_next='confirmed' and (select count(*) from sideout.hosting_participants where event_id=v_id and status='confirmed')>=v_event.capacity then raise exception 'This session is full.';end if;
     update sideout.hosting_participants set status=v_next,updated_at=v_now where event_id=v_id and user_id=v_target;
    end if;
   elsif p_action='rsvp' then
    if v_event.host_id=v_user then raise exception 'The host stays confirmed. Cancel the session if you cannot host.';end if;
    v_next:=p_data->>'status';if v_next is null or v_next not in ('maybe','declined') then raise exception 'Choose Maybe or Can’t go.';end if;
    insert into sideout.hosting_participants(event_id,user_id,status,updated_at) values(v_id,v_user,v_next,v_now)
    on conflict(event_id,user_id) do update set status=excluded.status,updated_at=excluded.updated_at;
   end if;
  end if;
 end if;

 select coalesce(jsonb_agg(sideout.hosting_event_view(q,v_user) order by case when v_scope='past' then -extract(epoch from q.starts_at) else extract(epoch from q.starts_at) end,q.id),'[]'::jsonb) into v_events
 from (select e.* from sideout.hosted_events e where
  (v_scope='upcoming' and e.status='published' and e.ends_at>v_now) or
  (v_scope='past' and e.ends_at<=v_now) or
  (v_scope='mine' and (e.host_id=v_user or exists(select 1 from sideout.hosting_participants p where p.event_id=e.id and p.user_id=v_user)))
  order by case when v_scope='past' then -extract(epoch from e.starts_at) else extract(epoch from e.starts_at) end,e.id limit 100) q;
 v_id:=coalesce(v_id,(v_events->0->>'id')::uuid);
 if v_id is not null then
  select * into v_event from sideout.hosted_events where id=v_id;
  if not found then raise exception 'This hosted session is unavailable.' using errcode='P0002';end if;
  v_selected:=sideout.hosting_event_view(v_event,v_user)||jsonb_build_object(
   'participants',coalesce((select jsonb_agg(sideout.player_view(p.user_id) order by p.updated_at,p.user_id) from sideout.hosting_participants p where p.event_id=v_id and p.status='confirmed'),'[]'::jsonb),
   'requests',case when v_event.host_id=v_user then coalesce((select jsonb_agg(jsonb_build_object('player',sideout.player_view(p.user_id),'status','requested') order by p.updated_at,p.user_id) from sideout.hosting_participants p where p.event_id=v_id and p.status='requested'),'[]'::jsonb) else '[]'::jsonb end);
 end if;
 v_result:=jsonb_build_object('events',v_events,'selectedEvent',v_selected,'me',jsonb_build_object('player',sideout.player_view(v_user),'isVerified',v_verified),'scope',v_scope,'serverTime',floor(extract(epoch from v_now)*1000));
 return v_result;
end $$;
revoke all on function sideout.hosting_event_view(sideout.hosted_events,uuid),sideout.hosting_api(text,jsonb) from public,anon,authenticated;
grant usage on schema sideout to authenticated;
grant execute on function sideout.hosting_api(text,jsonb) to authenticated;
create function public.sideout_hosting(p_action text,p_data jsonb default '{}') returns jsonb
language sql security invoker set search_path='' as $$ select sideout.hosting_api(p_action,p_data) $$;
revoke all on function public.sideout_hosting(text,jsonb) from public,anon,authenticated;
grant execute on function public.sideout_hosting(text,jsonb) to authenticated;
