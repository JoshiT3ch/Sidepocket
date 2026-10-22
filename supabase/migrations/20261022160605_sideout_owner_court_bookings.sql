-- Owner-submitted physical courts, operator-reviewed legitimacy and atomic hourly reservations.
-- Membership is operator-managed until a subscription provider is integrated.
-- There is deliberately no client action that can buy, grant or extend verification.
create table sideout.player_verifications (
  user_id uuid primary key references auth.users(id) on delete cascade,
  verified_until timestamptz not null,
  updated_at timestamptz not null default now()
);
create table sideout.court_reviewers (
  user_id uuid primary key references auth.users(id) on delete cascade
);
create table sideout.court_applications (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check(length(name) between 3 and 100),
  address text not null check(length(address) between 8 and 250),
  description text not null check(length(description) between 10 and 1500),
  contact text not null check(length(contact) between 5 and 150),
  evidence text not null check(length(evidence) between 15 and 2000),
  photo text check(photo is null or (length(photo)<=350000 and photo ~ '^data:image/jpeg;base64,[A-Za-z0-9+/=]+$')),
  rate integer not null check(rate between 0 and 10000),
  open_hour integer not null check(open_hour between 0 and 23),
  close_hour integer not null check(close_hour between 1 and 24 and close_hour>open_hour),
  status text not null default 'pending' check(status in ('pending','approved','rejected')),
  review_note text not null default '' check(length(review_note)<=500),
  reviewed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index court_applications_owner on sideout.court_applications(owner_id);
create index court_applications_review on sideout.court_applications(created_at) where status='pending';
create index court_applications_reviewer on sideout.court_applications(reviewed_by) where reviewed_by is not null;
-- Separate from the retired community directory: old records/presence remain intact.
create table sideout.bookable_courts (
  id uuid primary key default gen_random_uuid(),
  application_id uuid unique references sideout.court_applications(id) on delete cascade,
  is_test boolean not null default false,
  name text not null,
  address text not null,
  description text not null,
  photo text,
  rate integer not null check(rate between 0 and 10000),
  open_hour integer not null check(open_hour between 0 and 23),
  close_hour integer not null check(close_hour between 1 and 24 and close_hour>open_hour),
  check(is_test or application_id is not null)
);
insert into sideout.bookable_courts(is_test,name,address,description,rate,open_hour,close_hour)
values(true,'Court 1','Valencia City, Bukidnon · test listing','Practice making a reservation here. This is a test court, not a real venue.',0,6,22);
create table sideout.court_bookings (
  id uuid primary key default gen_random_uuid(),
  court_id uuid not null references sideout.bookable_courts(id) on delete cascade,
  player_id uuid not null references auth.users(id) on delete cascade,
  booking_date date not null,
  hour integer not null check(hour between 0 and 23),
  rate integer not null,
  status text not null default 'confirmed' check(status in ('confirmed','cancelled')),
  created_at timestamptz not null default now(),
  cancelled_at timestamptz,
  cancelled_by uuid references auth.users(id) on delete set null
);
-- This is the final arbiter even when different players race to reserve a slot.
create unique index court_bookings_one_slot on sideout.court_bookings(court_id,booking_date,hour) where status='confirmed';
create index court_bookings_player on sideout.court_bookings(player_id,booking_date desc,hour);
create index court_bookings_cancelled_by on sideout.court_bookings(cancelled_by) where cancelled_by is not null;
alter table sideout.player_verifications enable row level security;
alter table sideout.court_reviewers enable row level security;
alter table sideout.court_applications enable row level security;
alter table sideout.bookable_courts enable row level security;
alter table sideout.court_bookings enable row level security;
revoke all on sideout.player_verifications,sideout.court_reviewers,sideout.court_applications,sideout.bookable_courts,sideout.court_bookings from public,anon,authenticated;

create function sideout.booking_application_view(a sideout.court_applications) returns jsonb
language sql stable set search_path='' as $$
  select jsonb_build_object('id',a.id,'name',a.name,'address',a.address,'description',a.description,
    'contact',a.contact,'evidence',a.evidence,'photo',a.photo,'rate',a.rate,'openHour',a.open_hour,
    'closeHour',a.close_hour,'status',a.status,'reviewNote',a.review_note)
$$;

create function sideout.booking_api(p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  v_user uuid:=sideout.me(); v_now timestamptz:=clock_timestamp();
  v_today date:=(v_now at time zone 'Asia/Manila')::date;
  v_reviewer boolean; v_verified boolean; v_date date; v_hour integer;
  v_court sideout.bookable_courts; v_app sideout.court_applications; v_booking sideout.court_bookings;
  v_id uuid; v_result jsonb;
begin
  perform sideout.ensure(v_user);
  if jsonb_typeof(p_data) is distinct from 'object' then raise exception 'Please send valid form data.'; end if;
  v_reviewer:=exists(select 1 from sideout.court_reviewers where user_id=v_user);
  v_verified:=exists(select 1 from sideout.player_verifications where user_id=v_user and verified_until>v_now);
  if p_action='apply' then
    if not v_verified then raise exception 'Only verified players can apply to list a court. Verified membership is planned at PHP 100 per month; payments are not enabled yet.'; end if;
    if (p_data->>'authority') is distinct from 'on' then raise exception 'Confirm that you are authorized to manage this court.'; end if;
    perform sideout.lock_players(array[v_user]);
    if nullif(p_data->>'applicationId','') is not null then
      select * into v_app from sideout.court_applications where id=(p_data->>'applicationId')::uuid for update;
      if not found or v_app.owner_id<>v_user or v_app.status<>'rejected' then raise exception 'Only your returned applications can be resubmitted.'; end if;
      v_id:=v_app.id;
    else
      if (select count(*) from sideout.court_applications where owner_id=v_user and created_at>v_now-interval '24 hours')>=5 then raise exception 'You can submit up to 5 new court applications a day.'; end if;
      v_id:=gen_random_uuid();
    end if;
    insert into sideout.court_applications(id,owner_id,name,address,description,contact,evidence,photo,rate,open_hour,close_hour)
    values(v_id,v_user,btrim(p_data->>'name'),btrim(p_data->>'address'),btrim(p_data->>'description'),btrim(p_data->>'contact'),btrim(p_data->>'evidence'),nullif(p_data->>'photo',''),(p_data->>'rate')::integer,(p_data->>'openHour')::integer,(p_data->>'closeHour')::integer)
    on conflict(id) do update set name=excluded.name,address=excluded.address,description=excluded.description,contact=excluded.contact,evidence=excluded.evidence,photo=coalesce(excluded.photo,sideout.court_applications.photo),rate=excluded.rate,open_hour=excluded.open_hour,close_hour=excluded.close_hour,status='pending',review_note='',reviewed_by=null,updated_at=v_now;
    return jsonb_build_object('applicationId',v_id);
  elsif p_action='review' then
    if not v_reviewer then raise exception 'Only Sideout reviewers can approve courts.' using errcode='42501'; end if;
    if jsonb_typeof(p_data->'approve') is distinct from 'boolean' then raise exception 'Choose approve or request changes.'; end if;
    select * into v_app from sideout.court_applications where id=(p_data->>'applicationId')::uuid for update;
    if not found or v_app.status<>'pending' then raise exception 'This application is no longer pending.'; end if;
    if v_app.owner_id=v_user then raise exception 'Another reviewer must verify your own court.'; end if;
    if not (p_data->>'approve')::boolean and length(btrim(coalesce(p_data->>'note','')))=0 then raise exception 'Explain which details need changes.'; end if;
    update sideout.court_applications set status=case when (p_data->>'approve')::boolean then 'approved' else 'rejected' end,review_note=btrim(coalesce(p_data->>'note','')),reviewed_by=v_user,updated_at=v_now where id=v_app.id;
    if (p_data->>'approve')::boolean then
      insert into sideout.bookable_courts(application_id,name,address,description,photo,rate,open_hour,close_hour)
      values(v_app.id,v_app.name,v_app.address,v_app.description,v_app.photo,v_app.rate,v_app.open_hour,v_app.close_hour);
    end if;
    return jsonb_build_object('ok',true);
  elsif p_action='reserve' then
    v_date:=(p_data->>'date')::date;v_hour:=(p_data->>'hour')::integer;
    select * into v_court from sideout.bookable_courts where id=(p_data->>'courtId')::uuid for share;
    if not found then raise exception 'Choose an approved court.'; end if;
    if v_date is null or v_hour is null or v_date<v_today or v_date>v_today+30 or v_hour<v_court.open_hour or v_hour>=v_court.close_hour then raise exception 'Choose an available time within the next 30 days.'; end if;
    if ((v_date+make_time(v_hour,0,0)) at time zone 'Asia/Manila')<=v_now then raise exception 'This time has already started. Choose a later slot.'; end if;
    perform sideout.lock_players(array[v_user]);
    if (select count(*) from sideout.court_bookings where player_id=v_user and status='confirmed' and booking_date>=v_today)>=20 then raise exception 'You can hold up to 20 current or upcoming bookings.'; end if;
    -- Safe retry after a lost response: return the player's already-confirmed slot.
    select id into v_id from sideout.court_bookings where court_id=v_court.id and booking_date=v_date and hour=v_hour and status='confirmed' and player_id=v_user;
    if v_id is not null then return jsonb_build_object('bookingId',v_id); end if;
    begin
      insert into sideout.court_bookings(court_id,player_id,booking_date,hour,rate) values(v_court.id,v_user,v_date,v_hour,v_court.rate) returning id into v_id;
    exception when unique_violation then raise exception 'Someone just booked that slot. Refresh and choose another time.';
    end;
    return jsonb_build_object('bookingId',v_id);
  elsif p_action='cancel' then
    select * into v_booking from sideout.court_bookings where id=(p_data->>'bookingId')::uuid for update;
    if not found then raise exception 'Booking not found.'; end if;
    if v_booking.player_id<>v_user and not exists(select 1 from sideout.bookable_courts c join sideout.court_applications a on a.id=c.application_id where c.id=v_booking.court_id and a.owner_id=v_user) then raise exception 'You cannot cancel this booking.' using errcode='42501'; end if;
    if v_booking.status='cancelled' then return jsonb_build_object('ok',true); end if;
    if ((v_booking.booking_date+make_time(v_booking.hour,0,0)) at time zone 'Asia/Manila')<=v_now then raise exception 'A booking can only be cancelled before its start time.'; end if;
    update sideout.court_bookings set status='cancelled',cancelled_at=v_now,cancelled_by=v_user where id=v_booking.id;
    return jsonb_build_object('ok',true);
  elsif p_action='list' then
    v_date:=coalesce((nullif(p_data->>'date',''))::date,v_today);
    if v_date<v_today or v_date>v_today+30 then raise exception 'Choose a date within the next 30 days.'; end if;
    v_id:=nullif(p_data->>'courtId','')::uuid;
    if v_id is null then select id into v_id from sideout.bookable_courts order by is_test desc,name,id limit 1; end if;
    select * into v_court from sideout.bookable_courts where id=v_id;
    select jsonb_build_object(
      'selectedCourtId',v_court.id,'today',v_today,'lastDate',v_today+30,'isReviewer',v_reviewer,'isVerified',v_verified,
      'verifiedUntil',(select verified_until from sideout.player_verifications where user_id=v_user and verified_until>v_now),
      'courts',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'address',c.address,'description',c.description,'photo',c.photo,'rate',c.rate,'openHour',c.open_hour,'closeHour',c.close_hour,'isTest',c.is_test) order by c.is_test desc,c.name,c.id) from sideout.bookable_courts c),'[]'::jsonb),
      'slots',coalesce((select jsonb_agg(jsonb_build_object('hour',h,'past',((v_date+make_time(h,0,0)) at time zone 'Asia/Manila')<=v_now,'available',((v_date+make_time(h,0,0)) at time zone 'Asia/Manila')>v_now and not exists(select 1 from sideout.court_bookings b where b.court_id=v_court.id and b.booking_date=v_date and b.hour=h and b.status='confirmed')) order by h) from generate_series(v_court.open_hour,v_court.close_hour-1) h),'[]'::jsonb),
      'applications',coalesce((select jsonb_agg(sideout.booking_application_view(a) order by a.created_at desc) from sideout.court_applications a where a.owner_id=v_user),'[]'::jsonb),
      'reviews',case when v_reviewer then coalesce((select jsonb_agg(sideout.booking_application_view(a) order by a.created_at) from sideout.court_applications a where a.status='pending' and a.owner_id<>v_user),'[]'::jsonb) else '[]'::jsonb end,
      'bookings',coalesce((select jsonb_agg(x.data order by x.booking_date desc,x.hour) from (select b.booking_date,b.hour,jsonb_build_object('id',b.id,'courtName',c.name,'date',b.booking_date,'hour',b.hour,'rate',b.rate,'status',b.status,'isTest',c.is_test,'canCancel',b.status='confirmed' and ((b.booking_date+make_time(b.hour,0,0)) at time zone 'Asia/Manila')>v_now) data from sideout.court_bookings b join sideout.bookable_courts c on c.id=b.court_id where b.player_id=v_user order by b.booking_date desc,b.hour limit 100) x),'[]'::jsonb),
      'ownerBookings',coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'courtName',c.name,'date',b.booking_date,'hour',b.hour,'rate',b.rate,'status',b.status,'isTest',c.is_test,'canCancel',((b.booking_date+make_time(b.hour,0,0)) at time zone 'Asia/Manila')>v_now,'playerName',sideout.player_view(b.player_id)->>'name','playerCode',sideout.player_view(b.player_id)->>'code') order by b.booking_date,b.hour) from sideout.court_bookings b join sideout.bookable_courts c on c.id=b.court_id join sideout.court_applications a on a.id=c.application_id where a.owner_id=v_user and b.status='confirmed' and b.booking_date>=v_today),'[]'::jsonb)
    ) into v_result;
    return v_result;
  end if;
  raise exception 'This court action is not available.';
end $$;
revoke all on function sideout.booking_application_view(sideout.court_applications),sideout.booking_api(text,jsonb) from public,anon,authenticated;
-- Private definer owns authorization; the exposed gateway runs as the caller.
grant usage on schema sideout to authenticated;
grant execute on function sideout.booking_api(text,jsonb) to authenticated;
create function public.sideout_booking(p_action text,p_data jsonb default '{}') returns jsonb
language sql security invoker set search_path='' as $$ select sideout.booking_api(p_action,p_data) $$;
revoke all on function public.sideout_booking(text,jsonb) from public,anon,authenticated;
grant execute on function public.sideout_booking(text,jsonb) to authenticated;

-- The profile checkmark is derived from the protected entitlement, never profile JSON.
create or replace function public.sideout_profile() returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_id uuid:=sideout.me();v_profile jsonb;v_until timestamptz;
begin
  perform sideout.ensure(v_id);
  select data into v_profile from sideout.profiles where user_id=v_id;
  select verified_until into v_until from sideout.player_verifications where user_id=v_id and verified_until>clock_timestamp();
  return (v_profile-'isVerified'-'verifiedUntil') || jsonb_build_object('isVerified',v_until is not null,'verifiedUntil',v_until);
end $$;
revoke all on function public.sideout_profile() from public,anon,authenticated;
grant execute on function public.sideout_profile() to authenticated;

create or replace function sideout.player_view(p_id uuid) returns jsonb
language sql stable set search_path='' as $$
  select jsonb_build_object('id',p.user_id,'name',f.data->>'name','code',p.code,
    'rating',p.rating,'games',p.games,'wins',p.wins,
    'isVerified',exists(select 1 from sideout.player_verifications v where v.user_id=p.user_id and v.verified_until>now()),
    'avatar',jsonb_build_object('skin',f.data->'skin','shirt',f.data->'shirt','paddle',f.data->'paddle',
      'hat',f.data->'hat','height',f.data->'height','bodyType',f.data->'bodyType','characterType',f.data->'characterType',
      'hairStyle',f.data->'hairStyle','hairColor',f.data->'hairColor','capId',f.data->'capId','shirtId',f.data->'shirtId','bottomId',f.data->'bottomId'))
  from sideout.players p join sideout.profiles f on f.user_id=p.user_id where p.user_id=p_id
$$;
