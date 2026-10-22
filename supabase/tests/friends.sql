-- Execute as database owner after the Friends migration. No fixtures survive.
begin;

do $test$
declare
  ids uuid[] := array[]::uuid[]; u uuid; a uuid; b uuid; c uuid; d uuid; e uuid; unfinished uuid;
  rate_owner uuid; pending_owner uuid; i integer; n integer;
  code_a text; code_b text; code_c text; code_d text; code_e text; code_unfinished text; code_target text; code_missing text;
  result jsonb; first_result jsonb; entry jsonb; first_id uuid; old_id uuid; request_id uuid;
  rejected boolean; statement text; signature text; privilege text; before_ratings jsonb; after_ratings jsonb;
begin
  -- Every gateway requires an existing authenticated account, even when arguments
  -- are malformed or point to an unknown request.
  foreach statement in array array[
    'select public.sideout_friends()',
    'select public.sideout_friend_request(null)',
    'select public.sideout_friend_respond(null,true)',
    'select public.sideout_friend_cancel(null)',
    'select public.sideout_friend_remove(null)'
  ] loop
    execute 'set local role anon';
    rejected := false;
    begin execute statement; exception when insufficient_privilege then rejected := true; end;
    if not rejected then raise exception 'TEST: anonymous Friends gateway allowed: %',statement; end if;
    execute 'reset role';
    perform pg_catalog.set_config('request.jwt.claim.sub','',true);
    perform pg_catalog.set_config('request.jwt.claims','{}',true);
    execute 'set local role authenticated';
    rejected := false;
    begin execute statement; exception when insufficient_privilege then rejected := true; end;
    if not rejected then raise exception 'TEST: missing identity Friends gateway allowed: %',statement; end if;
    execute 'reset role';
    perform pg_catalog.set_config('request.jwt.claim.sub',pg_catalog.gen_random_uuid()::text,true);
    execute 'set local role authenticated';
    rejected := false;
    begin execute statement; exception when insufficient_privilege then rejected := true; end;
    if not rejected then raise exception 'TEST: nonexistent account Friends gateway allowed: %',statement; end if;
    execute 'reset role';
  end loop;

  -- Isolated, randomly identified fixtures: six flow accounts, two rate-limit
  -- owners, and 21 distinct recipients. Existing accounts are never changed.
  for i in 1..29 loop
    u := pg_catalog.gen_random_uuid(); ids := pg_catalog.array_append(ids,u);
    insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
    values(u,'authenticated','authenticated','sideout-friends-'||u::text||'@example.invalid','',pg_catalog.now(),
      '{"provider":"email","providers":["email"]}'::jsonb,'{"name":"Friends Fixture"}'::jsonb,pg_catalog.now(),pg_catalog.now());
    perform sideout.ensure(u);
    update sideout.profiles set data = data || '{"avatarCreated":true,"email":"private@example.invalid","token":"private-token"}'::jsonb where user_id = u;
  end loop;
  a := ids[1]; b := ids[2]; c := ids[3]; d := ids[4]; e := ids[5]; unfinished := ids[6];
  rate_owner := ids[7]; pending_owner := ids[8];
  update sideout.profiles set data = pg_catalog.jsonb_set(data,'{avatarCreated}','false'::jsonb) where user_id = unfinished;
  select p.code into code_a from sideout.players p where p.user_id = a;
  select p.code into code_b from sideout.players p where p.user_id = b;
  select p.code into code_c from sideout.players p where p.user_id = c;
  select p.code into code_d from sideout.players p where p.user_id = d;
  select p.code into code_e from sideout.players p where p.user_id = e;
  select p.code into code_unfinished from sideout.players p where p.user_id = unfinished;
  loop
    code_missing := 'SO-' || pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(pg_catalog.gen_random_uuid()::text,'-',''),1,12));
    exit when not exists(select 1 from sideout.players p where p.code = code_missing);
  end loop;
  select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(p.user_id,p.rating,p.games,p.wins) order by p.user_id)
    into before_ratings from sideout.players p where p.user_id = any(ids);

  -- Incomplete accounts can see an empty graph, but cannot initiate requests.
  perform pg_catalog.set_config('request.jwt.claim.sub',unfinished::text,true);
  execute 'set local role authenticated';
  if (public.sideout_friends() - array['me','courts','serverTime']) <> '{"friends":[],"incoming":[],"outgoing":[]}'::jsonb then raise exception 'TEST: initial Friends snapshot is not empty'; end if;
  rejected := false;
  begin perform public.sideout_friend_request(code_a); exception when raise_exception then rejected := true; end;
  if not rejected then raise exception 'TEST: unfinished sender created request'; end if;
  perform pg_catalog.set_config('request.jwt.claim.sub',a::text,true);
  foreach code_target in array array[null,'','not-a-code','SO-ABC',code_a] loop
    rejected := false;
    begin perform public.sideout_friend_request(code_target); exception when raise_exception then rejected := true; end;
    if not rejected then raise exception 'TEST: invalid or self friend request allowed'; end if;
  end loop;
  foreach code_target in array array[code_unfinished,code_missing] loop
    rejected := false;
    begin perform public.sideout_friend_request(code_target); exception when no_data_found then rejected := true; end;
    if not rejected then raise exception 'TEST: unknown or unfinished recipient allowed'; end if;
  end loop;

  -- Player codes normalize whitespace and case. Retries preserve one request ID.
  first_result := public.sideout_friend_request('  ' || pg_catalog.lower(code_b) || '  ');
  first_id := (first_result->'outgoing'->0->>'id')::uuid;
  if pg_catalog.jsonb_array_length(first_result->'outgoing') <> 1 or
    first_result->'outgoing'->0->'player'->>'id' <> b::text or
    pg_catalog.jsonb_array_length(first_result->'incoming') <> 0 or
    pg_catalog.jsonb_array_length(first_result->'friends') <> 0 then raise exception 'TEST: sender snapshot mismatch'; end if;
  if (public.sideout_friend_request(code_b) - 'serverTime') <> (first_result - 'serverTime') then raise exception 'TEST: duplicate send changed pending request'; end if;
  execute 'reset role';
  if (select pg_catalog.count(*) from sideout.friendships f where f.requester_id = a and f.recipient_id = b) <> 1 then raise exception 'TEST: duplicate history inserted'; end if;
  rejected := false;
  begin insert into sideout.friendships(requester_id,recipient_id) values(b,a); exception when unique_violation then rejected := true; end;
  if not rejected then raise exception 'TEST: active unordered pair uniqueness missing'; end if;
  rejected := false;
  begin insert into sideout.friendships(requester_id,recipient_id) values(a,a); exception when check_violation then rejected := true; end;
  if not rejected then raise exception 'TEST: table permits self friendship'; end if;
  execute 'set local role authenticated';

  -- Only the recipient can accept/decline; only the sender can cancel. A third
  -- account sees neither the graph nor valid request IDs in mutation responses.
  rejected := false;
  begin perform public.sideout_friend_respond(first_id,true); exception when no_data_found then rejected := true; end;
  if not rejected then raise exception 'TEST: requester accepted own request'; end if;
  rejected := false;
  begin perform public.sideout_friend_remove(first_id); exception when raise_exception then rejected := true; end;
  if not rejected then raise exception 'TEST: pending request removed as a friend'; end if;
  perform pg_catalog.set_config('request.jwt.claim.sub',c::text,true);
  if (public.sideout_friends() - array['me','courts','serverTime']) <> '{"friends":[],"incoming":[],"outgoing":[]}'::jsonb then raise exception 'TEST: third party can see a friendship'; end if;
  foreach statement in array array[
    pg_catalog.format('select public.sideout_friend_respond(%L,true)',first_id),
    pg_catalog.format('select public.sideout_friend_cancel(%L)',first_id),
    pg_catalog.format('select public.sideout_friend_remove(%L)',first_id)
  ] loop
    rejected := false;
    begin execute statement; exception when no_data_found then rejected := true; end;
    if not rejected then raise exception 'TEST: third party mutated friendship: %',statement; end if;
  end loop;
  perform pg_catalog.set_config('request.jwt.claim.sub',b::text,true);
  result := public.sideout_friends();
  if result->'incoming'->0->>'id' <> first_id::text or result->'incoming'->0->'player'->>'id' <> a::text then raise exception 'TEST: recipient incoming snapshot mismatch'; end if;
  rejected := false;
  begin perform public.sideout_friend_request(code_a); exception when raise_exception then rejected := true; end;
  if not rejected then raise exception 'TEST: crossed requests auto-accepted'; end if;
  rejected := false;
  begin perform public.sideout_friend_cancel(first_id); exception when no_data_found then rejected := true; end;
  if not rejected then raise exception 'TEST: recipient cancelled sender request'; end if;
  rejected := false;
  begin perform public.sideout_friend_respond(first_id,null); exception when raise_exception then rejected := true; end;
  if not rejected then raise exception 'TEST: null acceptance silently declined'; end if;
  rejected := false;
  begin perform public.sideout_friend_respond(pg_catalog.gen_random_uuid(),true); exception when no_data_found then rejected := true; end;
  if not rejected then raise exception 'TEST: nonexistent request accepted'; end if;
  result := public.sideout_friend_respond(first_id,true);
  if pg_catalog.jsonb_array_length(result->'friends') <> 1 or pg_catalog.jsonb_array_length(result->'incoming') <> 0 or
    result->'friends'->0->>'id' <> first_id::text or result->'friends'->0->'player'->>'id' <> a::text or
    result->'friends'->0->'createdAt' <> first_result->'outgoing'->0->'createdAt' then raise exception 'TEST: accepted friendship contract mismatch'; end if;
  if (public.sideout_friend_respond(first_id,true) - 'serverTime') <> (result - 'serverTime') then raise exception 'TEST: accept retry changed friendship'; end if;
  rejected := false;
  begin perform public.sideout_friend_respond(first_id,false); exception when raise_exception then rejected := true; end;
  if not rejected then raise exception 'TEST: accepted request declined later'; end if;
  perform pg_catalog.set_config('request.jwt.claim.sub',a::text,true);
  result := public.sideout_friends();
  if result->'friends'->0->'player'->>'id' <> b::text or pg_catalog.jsonb_array_length(result->'outgoing') <> 0 then raise exception 'TEST: accepted friendship not symmetric'; end if;
  if (public.sideout_friend_request(code_b) - 'serverTime') <> (result - 'serverTime') then raise exception 'TEST: already-friends send created request'; end if;
  entry := result->'friends'->0;
  if (select pg_catalog.count(*) from pg_catalog.jsonb_object_keys(result)) <> 6 or
    not (result ?& array['friends','incoming','outgoing','me','courts','serverTime']) or
    (select pg_catalog.count(*) from pg_catalog.jsonb_object_keys(entry)) <> 4 or
    not (entry ?& array['id','player','createdAt','presence']) or entry->'presence' <> 'null'::jsonb or
    pg_catalog.jsonb_typeof(entry->'createdAt') <> 'number' or
    (select pg_catalog.count(*) from pg_catalog.jsonb_object_keys(entry->'player')) <> 8 or
    not (entry->'player' ?& array['id','name','code','rating','games','wins','avatar','isVerified']) or
    (entry->'player') ?| array['email','token','history','avatarCreated','raw_user_meta_data'] or
    (entry->'player'->'avatar') ?| array['email','token','history','avatarCreated'] then raise exception 'TEST: private fields disclosed or invalid snapshot'; end if;
  rejected := false;
  begin perform public.sideout_friend_cancel(first_id); exception when raise_exception then rejected := true; end;
  if not rejected then raise exception 'TEST: accepted friendship cancelled as pending'; end if;

  -- Either friend may remove; repeat removals are safe. Ending a relationship
  -- imposes a pair-wide cooldown in either direction, without deleting history.
  perform pg_catalog.set_config('request.jwt.claim.sub',b::text,true);
  result := public.sideout_friend_remove(first_id);
  if (result - array['me','courts','serverTime']) <> '{"friends":[],"incoming":[],"outgoing":[]}'::jsonb or
    (public.sideout_friend_remove(first_id) - 'serverTime') <> (result - 'serverTime') then raise exception 'TEST: remove or remove retry failed'; end if;
  rejected := false;
  begin perform public.sideout_friend_request(code_a); exception when raise_exception then rejected := true; end;
  if not rejected then raise exception 'TEST: reverse remove cooldown bypassed'; end if;
  perform pg_catalog.set_config('request.jwt.claim.sub',a::text,true);
  if (public.sideout_friends() - array['me','courts','serverTime']) <> (result - array['me','courts','serverTime']) then raise exception 'TEST: removal not symmetric'; end if;
  rejected := false;
  begin perform public.sideout_friend_request(code_b); exception when raise_exception then rejected := true; end;
  if not rejected then raise exception 'TEST: remove cooldown bypassed'; end if;
  result := public.sideout_friend_request(code_c); old_id := (result->'outgoing'->0->>'id')::uuid;
  perform pg_catalog.set_config('request.jwt.claim.sub',c::text,true);
  result := public.sideout_friend_respond(old_id,false);
  if (result - array['me','courts','serverTime']) <> '{"friends":[],"incoming":[],"outgoing":[]}'::jsonb or
    (public.sideout_friend_respond(old_id,false) - 'serverTime') <> (result - 'serverTime') then raise exception 'TEST: decline or decline retry failed'; end if;
  perform pg_catalog.set_config('request.jwt.claim.sub',a::text,true);
  rejected := false;
  begin perform public.sideout_friend_request(code_c); exception when raise_exception then rejected := true; end;
  if not rejected then raise exception 'TEST: decline cooldown bypassed'; end if;
  execute 'reset role';
  update sideout.friendships set created_at = pg_catalog.clock_timestamp()-interval '26 hours',updated_at = pg_catalog.clock_timestamp()-interval '25 hours' where id = old_id;
  execute 'set local role authenticated';
  result := public.sideout_friend_request(code_c); request_id := (result->'outgoing'->0->>'id')::uuid;
  if request_id = old_id then raise exception 'TEST: re-request rewrote history row'; end if;
  result := public.sideout_friend_cancel(request_id);
  if (result - array['me','courts','serverTime']) <> '{"friends":[],"incoming":[],"outgoing":[]}'::jsonb or
    (public.sideout_friend_cancel(request_id) - 'serverTime') <> (result - 'serverTime') then raise exception 'TEST: cancel or cancel retry failed'; end if;
  perform pg_catalog.set_config('request.jwt.claim.sub',c::text,true);
  rejected := false;
  begin perform public.sideout_friend_request(code_a); exception when raise_exception then rejected := true; end;
  if not rejected then raise exception 'TEST: reverse cancel cooldown bypassed'; end if;
  rejected := false;
  begin perform public.sideout_friend_respond(request_id,true); exception when raise_exception then rejected := true; end;
  if not rejected then raise exception 'TEST: cancelled request accepted'; end if;
  execute 'reset role';
  if (select pg_catalog.count(*) from sideout.friendships f where f.requester_id = a and f.recipient_id = c) <> 2 or
    (select f.status from sideout.friendships f where f.id = old_id) <> 'declined' or
    (select f.status from sideout.friendships f where f.id = request_id) <> 'cancelled' then raise exception 'TEST: ended request history not retained'; end if;

  -- Cancellation cannot bypass the 20/hour sending limit: all historical rows
  -- count. Moving the clock window past those rows permits a new distinct pair.
  perform pg_catalog.set_config('request.jwt.claim.sub',rate_owner::text,true);
  for i in 9..28 loop
    select p.code into code_target from sideout.players p where p.user_id = ids[i];
    execute 'set local role authenticated';
    result := public.sideout_friend_request(code_target);
    perform public.sideout_friend_cancel((result->'outgoing'->0->>'id')::uuid);
    execute 'reset role';
  end loop;
  select p.code into code_target from sideout.players p where p.user_id = ids[29];
  execute 'set local role authenticated';
  rejected := false;
  begin perform public.sideout_friend_request(code_target);
  exception when raise_exception then
    if sqlerrm not like 'You can send up to 20 friend requests per hour.%' then raise; end if;
    rejected := true;
  end;
  if not rejected or pg_catalog.jsonb_array_length(public.sideout_friends()->'outgoing') <> 0 then raise exception 'TEST: hourly request cap bypassed'; end if;
  execute 'reset role';
  if (select pg_catalog.count(*) from sideout.friendships f where f.requester_id = rate_owner) <> 20 then raise exception 'TEST: hourly limit lost request history'; end if;
  update sideout.friendships set created_at = pg_catalog.clock_timestamp()-interval '2 hours',updated_at = pg_catalog.clock_timestamp()-interval '2 hours' where requester_id = rate_owner;
  execute 'set local role authenticated';
  if pg_catalog.jsonb_array_length(public.sideout_friend_request(code_target)->'outgoing') <> 1 then raise exception 'TEST: expired rate window blocked new target'; end if;
  execute 'reset role';

  -- Pending requests remain capped even after the hourly sending window passes.
  perform pg_catalog.set_config('request.jwt.claim.sub',pending_owner::text,true);
  for i in 9..28 loop
    select p.code into code_target from sideout.players p where p.user_id = ids[i];
    execute 'set local role authenticated';
    perform public.sideout_friend_request(code_target);
    execute 'reset role';
  end loop;
  update sideout.friendships set created_at = pg_catalog.clock_timestamp()-interval '2 hours',updated_at = pg_catalog.clock_timestamp()-interval '2 hours' where requester_id = pending_owner;
  select p.code into code_target from sideout.players p where p.user_id = ids[29];
  execute 'set local role authenticated';
  rejected := false;
  begin perform public.sideout_friend_request(code_target);
  exception when raise_exception then
    if sqlerrm not like 'You already have 20 pending friend requests.%' then raise; end if;
    rejected := true;
  end;
  if not rejected or pg_catalog.jsonb_array_length(public.sideout_friends()->'outgoing') <> 20 then raise exception 'TEST: pending request cap bypassed'; end if;
  execute 'reset role';

  -- Friendship operations cannot modify rating statistics or create duos.
  select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(p.user_id,p.rating,p.games,p.wins) order by p.user_id)
    into after_ratings from sideout.players p where p.user_id = any(ids);
  if before_ratings <> after_ratings or exists(select 1 from sideout.duo_members m where m.user_id = any(ids)) or
    exists(select 1 from sideout.matches m where m.created_by = any(ids)) then raise exception 'TEST: friendship changed ratings, duos or games'; end if;

  -- Account removal cascades its friendships. The fixture has no game/duo rows.
  perform pg_catalog.set_config('request.jwt.claim.sub',e::text,true);
  execute 'set local role authenticated';
  result := public.sideout_friend_request(code_d); request_id := (result->'outgoing'->0->>'id')::uuid;
  execute 'reset role';
  delete from auth.users where id = e;
  if exists(select 1 from sideout.friendships f where f.id = request_id) then raise exception 'TEST: deleted account retained friendships'; end if;

  -- Browser roles cannot inspect or mutate the private graph, even if a row's
  -- UUID is known. RLS and explicit grant checks are defense in depth.
  perform pg_catalog.set_config('request.jwt.claim.sub',a::text,true);
  execute 'set local role authenticated';
  rejected := false;
  begin perform f.id from sideout.friendships f; exception when insufficient_privilege then rejected := true; end;
  if not rejected then raise exception 'TEST: private friendship table readable'; end if;
  rejected := false;
  begin perform sideout.friends_view(b); exception when insufficient_privilege then rejected := true; end;
  if not rejected then raise exception 'TEST: private graph helper callable'; end if;
  execute 'reset role';
  if not (select t.relrowsecurity from pg_catalog.pg_class t join pg_catalog.pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'sideout' and t.relname = 'friendships') then raise exception 'TEST: friendships missing RLS'; end if;
  foreach privilege in array array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] loop
    if pg_catalog.has_table_privilege('authenticated','sideout.friendships',privilege) or
      pg_catalog.has_table_privilege('anon','sideout.friendships',privilege) then raise exception 'TEST: private graph table grant present: %',privilege; end if;
  end loop;
  if pg_catalog.has_function_privilege('authenticated','sideout.friends_view(uuid)','EXECUTE') or
    pg_catalog.has_function_privilege('anon','sideout.friends_view(uuid)','EXECUTE') then raise exception 'TEST: private graph helper grant present'; end if;
  foreach signature in array array['public.sideout_friends()','public.sideout_friend_request(text)',
    'public.sideout_friend_respond(uuid,boolean)','public.sideout_friend_cancel(uuid)','public.sideout_friend_remove(uuid)'] loop
    if pg_catalog.has_function_privilege('anon',signature,'EXECUTE') or
      not pg_catalog.has_function_privilege('authenticated',signature,'EXECUTE') then raise exception 'TEST: Friends gateway grants mismatch: %',signature; end if;
  end loop;
  select pg_catalog.count(*) into n from pg_catalog.pg_proc f join pg_catalog.pg_namespace n on n.oid = f.pronamespace
    where n.nspname = 'public' and f.proname in ('sideout_friends','sideout_friend_request','sideout_friend_respond','sideout_friend_cancel','sideout_friend_remove')
      and f.prosecdef and 'search_path=""' = any(f.proconfig);
  if n <> 5 then raise exception 'TEST: unsafe Friends gateway configuration'; end if;
  raise notice 'Sideout Friends SQL acceptance checks passed; fixtures will be rolled back.';
end
$test$;
rollback;
