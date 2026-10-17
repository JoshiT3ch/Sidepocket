-- Run as the database owner after Friends and friend-presence migrations.
-- These rollback-only fixtures never touch existing accounts.
begin;

do $test$
declare
  ids uuid[] := array[]::uuid[]; u uuid; a uuid; b uuid; pending uuid; stranger uuid; unfinished uuid;
  i integer; n integer; accepted_id uuid; pending_id uuid; result jsonb; entry jsonb; own jsonb;
  signature text; statement text; privilege text; rejected boolean; before_row jsonb; after_row jsonb;
  expiry timestamptz; at_time timestamptz; selected_court text := 'paddle-grove';
begin
  -- Authentication is checked before input validation. Browser roles receive no
  -- private-table access and cannot impersonate an owner in the API arguments.
  foreach statement in array array[
    'select public.sideout_presence_update(null,null,null,null)',
    'select public.sideout_presence_hide()'
  ] loop
    execute 'set local role anon';
    rejected := false;
    begin execute statement; exception when insufficient_privilege then rejected := true; end;
    if not rejected then raise exception 'TEST: anonymous presence gateway allowed'; end if;
    execute 'reset role';
    perform pg_catalog.set_config('request.jwt.claim.sub','',true);
    perform pg_catalog.set_config('request.jwt.claims','{}',true);
    execute 'set local role authenticated';
    rejected := false;
    begin execute statement; exception when insufficient_privilege then rejected := true; end;
    if not rejected then raise exception 'TEST: missing identity presence gateway allowed'; end if;
    execute 'reset role';
    perform pg_catalog.set_config('request.jwt.claim.sub',pg_catalog.gen_random_uuid()::text,true);
    execute 'set local role authenticated';
    rejected := false;
    begin execute statement; exception when insufficient_privilege then rejected := true; end;
    if not rejected then raise exception 'TEST: nonexistent account presence gateway allowed'; end if;
    execute 'reset role';
  end loop;

  for i in 1..5 loop
    u := pg_catalog.gen_random_uuid(); ids := pg_catalog.array_append(ids,u);
    insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
    values(u,'authenticated','authenticated','sideout-presence-'||u::text||'@example.invalid','',pg_catalog.now(),
      '{"provider":"email","providers":["email"]}'::jsonb,'{"name":"Presence Fixture"}'::jsonb,pg_catalog.now(),pg_catalog.now());
    perform sideout.ensure(u);
    update sideout.profiles set data = data || '{"avatarCreated":true}'::jsonb where user_id = u;
  end loop;
  a := ids[1]; b := ids[2]; pending := ids[3]; stranger := ids[4]; unfinished := ids[5];
  update sideout.profiles set data = pg_catalog.jsonb_set(data,'{avatarCreated}','false'::jsonb) where user_id = unfinished;
  insert into sideout.friendships(requester_id,recipient_id,status) values(a,b,'accepted') returning id into accepted_id;
  insert into sideout.friendships(requester_id,recipient_id) values(a,pending) returning id into pending_id;

  perform pg_catalog.set_config('request.jwt.claim.sub',a::text,true);
  execute 'set local role authenticated';
  result := public.sideout_friends(); own := result->'me'->'presence';
  if own <> '{"status":"available","courtId":null,"shareStatus":false,"shareLocation":false,"updatedAt":null,"expiresAt":null}'::jsonb or
    result->'friends'->0->'presence' <> 'null'::jsonb or
    pg_catalog.jsonb_typeof(result->'serverTime') <> 'number' or
    pg_catalog.jsonb_array_length(result->'courts') <> 8 then raise exception 'TEST: default privacy snapshot mismatch'; end if;
  if result->'outgoing'->0 ? 'presence' then raise exception 'TEST: pending outgoing request includes presence'; end if;

  -- Validate enum, court and exact JSON booleans. Invalid requests are atomic.
  foreach statement in array array[
    $$select public.sideout_presence_update(null,null,'false','false')$$,
    $$select public.sideout_presence_update('online',null,'false','false')$$,
    $$select public.sideout_presence_update('available',null,null,'false')$$,
    $$select public.sideout_presence_update('available',null,'"true"','false')$$,
    $$select public.sideout_presence_update('available',null,'false','0')$$,
    $$select public.sideout_presence_update('available',null,'[]','false')$$,
    $$select public.sideout_presence_update('available',null,'false','null')$$,
    $$select public.sideout_presence_update('available',null,'false','true')$$,
    $$select public.sideout_presence_update('available','unknown-court','true','false')$$
  ] loop
    rejected := false;
    begin execute statement;
    exception when raise_exception or no_data_found then rejected := true; end;
    if not rejected then raise exception 'TEST: invalid presence input allowed: %',statement; end if;
  end loop;
  execute 'reset role';
  if exists(select 1 from sideout.friend_presence p where p.user_id = a) then raise exception 'TEST: invalid request inserted presence'; end if;

  -- Saving privately is allowed before avatar completion; sharing is not.
  perform pg_catalog.set_config('request.jwt.claim.sub',unfinished::text,true);
  execute 'set local role authenticated';
  perform public.sideout_presence_update('away',selected_court,'false','false');
  rejected := false;
  begin perform public.sideout_presence_update('available',null,'true','false');
  exception when raise_exception then rejected := true; end;
  if not rejected then raise exception 'TEST: unfinished account shared status'; end if;
  result := public.sideout_presence_hide();
  if result->'me'->'presence'->'shareStatus' <> 'false'::jsonb or result->'me'->'presence'->'courtId' <> 'null'::jsonb then
    raise exception 'TEST: unfinished account cannot hide'; end if;

  -- Share both fields. Only accepted friends can see them; pending requests and
  -- public courts remain separate opt-in actions, with no last-seen timestamps.
  perform pg_catalog.set_config('request.jwt.claim.sub',a::text,true);
  result := public.sideout_presence_update('playing',selected_court,'true','true');
  own := result->'me'->'presence';
  if own->>'status' <> 'playing' or own->>'courtId' <> selected_court or
    own->'shareStatus' <> 'true'::jsonb or own->'shareLocation' <> 'true'::jsonb or
    (own->>'expiresAt')::bigint - (own->>'updatedAt')::bigint <> 7200000 then raise exception 'TEST: owner sharing/TTL mismatch'; end if;
  execute 'reset role';
  if exists(select 1 from sideout.court_checkins k where k.user_id = a) then raise exception 'TEST: friend share created public check-in'; end if;
  select p.expires_at into expiry from sideout.friend_presence p where p.user_id = a;
  select pg_catalog.to_jsonb(p) into before_row from sideout.friend_presence p where p.user_id = a;

  perform pg_catalog.set_config('request.jwt.claim.sub',b::text,true);
  execute 'set local role authenticated';
  result := public.sideout_friends(); entry := result->'friends'->0->'presence';
  if (select pg_catalog.count(*) from pg_catalog.jsonb_object_keys(entry)) <> 3 or
    entry->>'status' <> 'playing' or entry->'court'->>'id' <> selected_court or
    entry->'court'->>'name' <> 'Paddle Grove' or pg_catalog.jsonb_typeof(entry->'expiresAt') <> 'number' or
    entry ?| array['updatedAt','checkedInAt','userId','shareStatus','shareLocation','online','lastSeen'] then raise exception 'TEST: accepted friend presence contract mismatch'; end if;
  -- Reads never renew or write the owner's presence.
  perform public.sideout_friends();
  execute 'reset role';
  select pg_catalog.to_jsonb(p) into after_row from sideout.friend_presence p where p.user_id = a;
  if before_row <> after_row then raise exception 'TEST: reading renewed presence'; end if;
  if sideout.friend_presence_view(stranger,a,pg_catalog.clock_timestamp()) is not null or
    sideout.friend_presence_view(pending,a,pg_catalog.clock_timestamp()) is not null or
    sideout.friend_presence_view(a,a,pg_catalog.clock_timestamp()) is not null then raise exception 'TEST: relationship helper exposed presence'; end if;
  perform pg_catalog.set_config('request.jwt.claim.sub',pending::text,true);
  execute 'set local role authenticated';
  result := public.sideout_friends();
  if result->'incoming'->0 ? 'presence' or pg_catalog.jsonb_array_length(result->'friends') <> 0 then raise exception 'TEST: pending incoming request includes presence'; end if;

  -- Toggling one field never exposes the other. Disabling location also removes
  -- a public court check-in in the same transaction, including an unexpired one.
  perform pg_catalog.set_config('request.jwt.claim.sub',a::text,true);
  perform public.sideout_court_check_in(selected_court,'playing','true');
  perform public.sideout_presence_update('practice',selected_court,'true','false');
  execute 'reset role';
  if exists(select 1 from sideout.court_checkins k where k.user_id = a) then raise exception 'TEST: hide-location left public check-in'; end if;
  perform pg_catalog.set_config('request.jwt.claim.sub',b::text,true);
  execute 'set local role authenticated';
  entry := public.sideout_friends()->'friends'->0->'presence';
  if entry->>'status' <> 'practice' or entry->'court' <> 'null'::jsonb then raise exception 'TEST: status-only share leaked court'; end if;
  perform pg_catalog.set_config('request.jwt.claim.sub',a::text,true);
  perform public.sideout_presence_update('away',selected_court,'false','true');
  perform pg_catalog.set_config('request.jwt.claim.sub',b::text,true);
  entry := public.sideout_friends()->'friends'->0->'presence';
  if entry->'status' <> 'null'::jsonb or entry->'court'->>'id' <> selected_court then raise exception 'TEST: court-only share leaked status'; end if;

  -- All four allowed status values work, and updating one account never mutates
  -- another. A save with both toggles disabled is immediately private.
  perform pg_catalog.set_config('request.jwt.claim.sub',a::text,true);
  foreach statement in array array['available','playing','practice','away'] loop
    result := public.sideout_presence_update(statement,selected_court,'true','false');
    if result->'me'->'presence'->>'status' <> statement then raise exception 'TEST: valid status rejected'; end if;
  end loop;
  execute 'reset role';
  if exists(select 1 from sideout.friend_presence p where p.user_id in (b,pending,stranger)) then raise exception 'TEST: presence update modified another account'; end if;
  execute 'set local role authenticated';
  result := public.sideout_presence_update('away',selected_court,'false','false');
  if result->'me'->'presence'->>'courtId' <> selected_court or result->'me'->'presence'->'expiresAt' <> 'null'::jsonb then raise exception 'TEST: private selection mismatch'; end if;
  perform pg_catalog.set_config('request.jwt.claim.sub',b::text,true);
  if public.sideout_friends()->'friends'->0->'presence' <> 'null'::jsonb then raise exception 'TEST: disabled sharing leaked fields'; end if;

  -- Two-hour expiry is enforced by reads, at the exact boundary, even if no
  -- cleanup job has run. The owner retains selections but sees sharing disabled.
  perform pg_catalog.set_config('request.jwt.claim.sub',a::text,true);
  perform public.sideout_presence_update('playing',selected_court,'true','true');
  execute 'reset role';
  select p.expires_at into expiry from sideout.friend_presence p where p.user_id = a;
  if sideout.friend_presence_view(b,a,expiry) is not null then raise exception 'TEST: expiry boundary is visible'; end if;
  at_time := pg_catalog.clock_timestamp()-interval '3 hours';
  update sideout.friend_presence set updated_at = at_time,expires_at = at_time+interval '2 hours' where user_id = a;
  perform pg_catalog.set_config('request.jwt.claim.sub',b::text,true);
  execute 'set local role authenticated';
  if public.sideout_friends()->'friends'->0->'presence' <> 'null'::jsonb then raise exception 'TEST: expired presence leaked fields'; end if;
  perform pg_catalog.set_config('request.jwt.claim.sub',a::text,true);
  own := public.sideout_friends()->'me'->'presence';
  if own->'shareStatus' <> 'false'::jsonb or own->'shareLocation' <> 'false'::jsonb or
    own->'expiresAt' <> 'null'::jsonb or own->>'status' <> 'playing' or own->>'courtId' <> selected_court then raise exception 'TEST: expired owner flags did not normalize'; end if;

  -- Hide is idempotent, clears the selected court and public roster entry, and
  -- never adds a visible timestamp that friends could use as last-seen data.
  perform public.sideout_court_check_in(selected_court,'playing','true');
  result := public.sideout_presence_hide(); own := result->'me'->'presence';
  if own->'shareStatus' <> 'false'::jsonb or own->'shareLocation' <> 'false'::jsonb or
    own->'courtId' <> 'null'::jsonb or own->'expiresAt' <> 'null'::jsonb then raise exception 'TEST: hide contract mismatch'; end if;
  perform public.sideout_presence_hide();
  execute 'reset role';
  if exists(select 1 from sideout.court_checkins k where k.user_id = a) then raise exception 'TEST: hide left public roster entry'; end if;
  perform pg_catalog.set_config('request.jwt.claim.sub',b::text,true);
  execute 'set local role authenticated';
  if public.sideout_friends()->'friends'->0->'presence' <> 'null'::jsonb then raise exception 'TEST: hidden presence leaked fields'; end if;

  -- Removing a friendship revokes visibility immediately in both directions.
  perform pg_catalog.set_config('request.jwt.claim.sub',a::text,true);
  perform public.sideout_presence_update('playing',selected_court,'true','true');
  perform public.sideout_friend_remove(accepted_id);
  execute 'reset role';
  if sideout.friend_presence_view(b,a,pg_catalog.clock_timestamp()) is not null then raise exception 'TEST: removed friend retained visibility'; end if;

  -- Database constraints and grants remain a second layer behind gateways.
  perform pg_catalog.set_config('request.jwt.claim.sub',b::text,true);
  execute 'set local role authenticated';
  rejected := false;
  begin perform p.user_id from sideout.friend_presence p; exception when insufficient_privilege then rejected := true; end;
  if not rejected then raise exception 'TEST: private presence table readable'; end if;
  rejected := false;
  begin perform sideout.friend_presence_view(b,a,pg_catalog.clock_timestamp()); exception when insufficient_privilege then rejected := true; end;
  if not rejected then raise exception 'TEST: private presence helper callable'; end if;
  execute 'reset role';
  if not (select t.relrowsecurity from pg_catalog.pg_class t join pg_catalog.pg_namespace ns on ns.oid = t.relnamespace
    where ns.nspname = 'sideout' and t.relname = 'friend_presence') then raise exception 'TEST: presence RLS disabled'; end if;
  foreach privilege in array array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] loop
    if pg_catalog.has_table_privilege('authenticated','sideout.friend_presence',privilege) or
      pg_catalog.has_table_privilege('anon','sideout.friend_presence',privilege) then raise exception 'TEST: private presence table grant present'; end if;
  end loop;
  if pg_catalog.has_function_privilege('authenticated','sideout.friend_presence_view(uuid,uuid,timestamptz)','EXECUTE') or
    pg_catalog.has_function_privilege('anon','sideout.friend_presence_view(uuid,uuid,timestamptz)','EXECUTE') then raise exception 'TEST: private presence helper grant present'; end if;
  foreach signature in array array['public.sideout_presence_update(text,text,jsonb,jsonb)','public.sideout_presence_hide()'] loop
    if pg_catalog.has_function_privilege('anon',signature,'EXECUTE') or
      not pg_catalog.has_function_privilege('authenticated',signature,'EXECUTE') then raise exception 'TEST: presence gateway grants mismatch'; end if;
  end loop;
  select pg_catalog.count(*) into n from pg_catalog.pg_proc f join pg_catalog.pg_namespace ns on ns.oid = f.pronamespace
    where ns.nspname = 'public' and f.proname in ('sideout_presence_update','sideout_presence_hide')
      and f.prosecdef and 'search_path=""' = any(f.proconfig);
  if n <> 2 then raise exception 'TEST: unsafe presence gateway configuration'; end if;
  delete from auth.users where id = a;
  if exists(select 1 from sideout.friend_presence p where p.user_id = a) then raise exception 'TEST: deleted account retained presence'; end if;
  raise notice 'Sideout friend presence acceptance checks passed; fixtures will be rolled back.';
end
$test$;
rollback;
