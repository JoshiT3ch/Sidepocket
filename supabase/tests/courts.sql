-- Run as database owner after the courts migration. All fixtures roll back.
begin;
do $test$
declare
  a uuid := pg_catalog.gen_random_uuid(); b uuid := pg_catalog.gen_random_uuid();
  unready uuid := pg_catalog.gen_random_uuid(); u uuid;
  snapshot jsonb; original jsonb; current_check jsonb; invalid jsonb;
  rejected boolean; attempt text; n integer; rating_before bigint;
begin
  execute 'set local role anon';
  rejected := false;
  begin perform public.sideout_courts(); exception when insufficient_privilege then rejected := true; end;
  if not rejected then raise exception 'TEST: anonymous court read'; end if;
  rejected := false;
  begin perform public.sideout_court_check_in('paddle-grove','idle','true'::jsonb); exception when insufficient_privilege then rejected := true; end;
  if not rejected then raise exception 'TEST: anonymous court check-in'; end if;
  rejected := false;
  begin perform public.sideout_court_leave(); exception when insufficient_privilege then rejected := true; end;
  if not rejected then raise exception 'TEST: anonymous court leave'; end if;
  execute 'reset role';
  perform pg_catalog.set_config('request.jwt.claim.sub','',true);
  perform pg_catalog.set_config('request.jwt.claims','{}',true);
  execute 'set local role authenticated';
  rejected := false;
  begin perform public.sideout_courts(); exception when insufficient_privilege then rejected := true; end;
  if not rejected then raise exception 'TEST: identity-free court read'; end if;
  rejected := false;
  begin perform public.sideout_court_check_in('paddle-grove','idle','true'::jsonb); exception when insufficient_privilege then rejected := true; end;
  if not rejected then raise exception 'TEST: identity-free check-in'; end if;
  rejected := false;
  begin perform public.sideout_court_leave(); exception when insufficient_privilege then rejected := true; end;
  if not rejected then raise exception 'TEST: identity-free leave'; end if;
  execute 'reset role';

  foreach u in array array[a,b,unready] loop
    insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
    values(u,'authenticated','authenticated','sideout-courts-'||u::text||'@example.invalid','',pg_catalog.now(),
      '{"provider":"email","providers":["email"]}'::jsonb,'{"name":"Court Fixture"}'::jsonb,pg_catalog.now(),pg_catalog.now());
    perform pg_catalog.set_config('request.jwt.claim.sub',u::text,true);
    perform pg_catalog.set_config('request.jwt.claims',pg_catalog.jsonb_build_object('sub',u,'role','authenticated')::text,true);
    execute 'set local role authenticated';
    snapshot := public.sideout_courts(); -- Initializes profile and ladder even before avatar setup.
    if pg_catalog.jsonb_array_length(snapshot->'courts') <> 8 or snapshot->'players' <> '[]'::jsonb or
      snapshot->'selectedCourtId' <> 'null'::jsonb or snapshot->'me'->'checkIn' <> 'null'::jsonb or
      (snapshot->'me'->'player'->>'id')::uuid <> u or snapshot->>'ttlMinutes' <> '120' or snapshot->>'rosterLimit' <> '100' then
      raise exception 'TEST: directory contract';
    end if;
    if u <> unready then perform public.sideout_save_profile('{"avatarCreated":true}'::jsonb); end if;
    execute 'reset role';
  end loop;
  select p.rating into rating_before from sideout.players p where p.user_id = a;
  perform pg_catalog.set_config('request.jwt.claim.sub',unready::text,true);
  execute 'set local role authenticated';
  rejected := false;
  begin perform public.sideout_court_check_in('paddle-grove','idle','true'::jsonb); exception when raise_exception then rejected := true; end;
  if not rejected then raise exception 'TEST: unfinished avatar checked in'; end if;
  perform public.sideout_court_leave();

  perform pg_catalog.set_config('request.jwt.claim.sub',a::text,true);
  snapshot := public.sideout_court_check_in('paddle-grove','playing','true'::jsonb);
  original := snapshot->'me'->'checkIn';
  if snapshot->>'selectedCourtId' <> 'paddle-grove' or original->>'status' <> 'playing' or original->'openPlay' <> 'true'::jsonb or
    (original->>'expiresAt')::bigint-(original->>'updatedAt')::bigint <> 7200000 or
    original->>'updatedAt' <> snapshot->>'serverTime' then raise exception 'TEST: check-in contract or TTL'; end if;
  if snapshot::text ~ '(encrypted_password|sideout-courts-|@example.invalid|raw_user_meta_data|email)' then raise exception 'TEST: private information leaked'; end if;
  snapshot := public.sideout_courts('paddle-grove');
  if snapshot->'me'->'checkIn' <> original then raise exception 'TEST: read renewed presence'; end if;

  -- Unlike PostgREST boolean arguments, jsonb preserves original JSON types.
  foreach invalid in array array['"false"'::jsonb,'"true"'::jsonb,'0'::jsonb,'1'::jsonb,'null'::jsonb,'{}'::jsonb,'[]'::jsonb,null::jsonb] loop
    rejected := false;
    begin perform public.sideout_court_check_in('the-bodega','idle',invalid); exception when raise_exception then rejected := true; end;
    if not rejected then raise exception 'TEST: accepted non-boolean open play %',invalid; end if;
  end loop;
  foreach attempt in array array['Playing','practicing','',null::text] loop
    rejected := false;
    begin perform public.sideout_court_check_in('the-bodega',attempt,'true'::jsonb); exception when raise_exception then rejected := true; end;
    if not rejected then raise exception 'TEST: accepted invalid status %',attempt; end if;
  end loop;
  rejected := false;
  begin perform public.sideout_court_check_in('unknown','idle','false'::jsonb); exception when no_data_found then rejected := true; end;
  if not rejected then raise exception 'TEST: accepted unknown court'; end if;
  rejected := false;
  begin perform public.sideout_court_leave('unknown'); exception when no_data_found then rejected := true; end;
  if not rejected or public.sideout_courts()->'me'->'checkIn' <> original then raise exception 'TEST: invalid leave changed presence'; end if;

  perform pg_catalog.set_config('request.jwt.claim.sub',b::text,true);
  snapshot := public.sideout_court_check_in('paddle-grove','idle','false'::jsonb);
  if (snapshot->'players'->0->'player'->>'id')::uuid <> b or pg_catalog.jsonb_array_length(snapshot->'players') <> 2 or
    snapshot->'courts'->0->>'playerCount' <> '2' or snapshot->'courts'->0->>'openPlayCount' <> '1' then raise exception 'TEST: two-account roster/counts'; end if;
  perform pg_catalog.set_config('request.jwt.claim.sub',a::text,true);
  snapshot := public.sideout_court_check_in('paddle-grove','practice','false'::jsonb);
  if snapshot->'me'->'checkIn'->>'checkedInAt' <> original->>'checkedInAt' or snapshot->'courts'->0->>'openPlayCount' <> '0' then
    raise exception 'TEST: same-court status update'; end if;
  snapshot := public.sideout_court_check_in('the-bodega','idle','true'::jsonb);
  if snapshot->'courts'->0->>'playerCount' <> '1' or snapshot->'courts'->7->>'playerCount' <> '1' or
    (snapshot->'players'->0->'player'->>'id')::uuid <> a then raise exception 'TEST: atomic move'; end if;
  execute 'reset role';
  select pg_catalog.count(*) into n from sideout.court_checkins k where k.user_id = a;
  if n <> 1 then raise exception 'TEST: account present at multiple courts'; end if;
  -- Keep check constraints valid while expiring this account.
  update sideout.court_checkins set checked_in_at=pg_catalog.now()-interval '3 hours',updated_at=pg_catalog.now()-interval '3 hours',expires_at=pg_catalog.now()-interval '1 hour' where user_id=a;
  execute 'set local role authenticated';
  snapshot := public.sideout_courts('the-bodega');
  if snapshot->'me'->'checkIn' <> 'null'::jsonb or snapshot->'players' <> '[]'::jsonb or snapshot->'courts'->7->>'playerCount' <> '0' then raise exception 'TEST: expired presence visible'; end if;
  snapshot := public.sideout_court_check_in('paddle-grove','playing','true'::jsonb);
  if snapshot->'courts'->0->>'playerCount' <> '2' or (snapshot->'me'->'checkIn'->>'checkedInAt')::bigint < (original->>'checkedInAt')::bigint then raise exception 'TEST: expired presence failed to restart'; end if;
  snapshot := public.sideout_court_leave('paddle-grove');
  if snapshot->'me'->'checkIn' <> 'null'::jsonb or pg_catalog.jsonb_array_length(snapshot->'players') <> 1 or
    (snapshot->'players'->0->'player'->>'id')::uuid <> b then raise exception 'TEST: leave affected another account'; end if;
  perform public.sideout_court_leave(); -- Idempotent self-only leave.

  rejected := false;
  begin perform k.user_id from sideout.court_checkins k; exception when insufficient_privilege then rejected := true; end;
  if not rejected then raise exception 'TEST: direct private presence access'; end if;
  rejected := false;
  begin perform sideout.courts_view(b,null,pg_catalog.clock_timestamp()); exception when insufficient_privilege then rejected := true; end;
  if not rejected then raise exception 'TEST: private helper permits identity spoofing'; end if;
  execute 'reset role';
  if (select p.rating from sideout.players p where p.user_id=a) <> rating_before or
    (select p.games from sideout.players p where p.user_id=a) <> 0 then raise exception 'TEST: courts changed MMR'; end if;
  if exists(select 1 from pg_catalog.pg_class t join pg_catalog.pg_namespace s on s.oid=t.relnamespace
    where s.nspname='sideout' and t.relname in('courts','court_checkins') and not t.relrowsecurity) then raise exception 'TEST: courts missing RLS'; end if;
  foreach attempt in array array['sideout.courts','sideout.court_checkins'] loop
    if pg_catalog.has_table_privilege('anon',attempt,'SELECT') or pg_catalog.has_table_privilege('authenticated',attempt,'SELECT') or
      pg_catalog.has_table_privilege('authenticated',attempt,'INSERT') or pg_catalog.has_table_privilege('authenticated',attempt,'UPDATE') or
      pg_catalog.has_table_privilege('authenticated',attempt,'DELETE') then raise exception 'TEST: court table grants'; end if;
  end loop;
  foreach attempt in array array['public.sideout_courts(text)','public.sideout_court_check_in(text,text,jsonb)','public.sideout_court_leave(text)'] loop
    if pg_catalog.has_function_privilege('anon',attempt,'EXECUTE') or not pg_catalog.has_function_privilege('authenticated',attempt,'EXECUTE') then raise exception 'TEST: gateway grants %',attempt; end if;
  end loop;
  if exists(select 1 from pg_catalog.pg_proc f join pg_catalog.pg_namespace s on s.oid=f.pronamespace
    where s.nspname='public' and f.proname in('sideout_courts','sideout_court_check_in','sideout_court_leave') and
      (not f.prosecdef or not ('search_path=""'=any(f.proconfig)))) then raise exception 'TEST: unsafe court gateway'; end if;
  rejected := false;
  begin insert into sideout.court_checkins values(pg_catalog.gen_random_uuid(),'paddle-grove','idle',false,pg_catalog.now(),pg_catalog.now(),pg_catalog.now()+interval '2 hours');
  exception when foreign_key_violation then rejected := true; end;
  if not rejected then raise exception 'TEST: missing player FK'; end if;
  rejected := false;
  begin insert into sideout.court_checkins values(a,'unknown','idle',false,pg_catalog.now(),pg_catalog.now(),pg_catalog.now()+interval '2 hours');
  exception when foreign_key_violation then rejected := true; end;
  if not rejected then raise exception 'TEST: missing court FK'; end if;
  delete from auth.users where id=b;
  if exists(select 1 from sideout.court_checkins k where k.user_id=b) then raise exception 'TEST: deleted player presence retained'; end if;
  raise notice 'Sideout court SQL acceptance checks passed; fixtures will be rolled back.';
end $test$;
rollback;
