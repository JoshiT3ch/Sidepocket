-- Transactional acceptance and permission checks. No fixture users survive.
-- Execute as the project database owner; all application calls run as client roles.
begin;
do $test$
declare
  a uuid := pg_catalog.gen_random_uuid(); b uuid := pg_catalog.gen_random_uuid();
  c uuid := pg_catalog.gen_random_uuid(); d uuid := pg_catalog.gen_random_uuid();
  outsider uuid := pg_catalog.gen_random_uuid(); u uuid; invitation uuid; game uuid;
  code_a text; code_b text; code_c text; code_d text; result jsonb; before_result jsonb; game_view jsonb;
  rejected boolean; style text; color text; item text; category text; test_count integer := 0;
begin
  -- Anonymous and authenticated-without-a-JWT cannot call the API.
  execute 'set local role anon';
  rejected := false;
  begin perform public.sideout_profile(); exception when insufficient_privilege then rejected := true; end;
  if not rejected then raise exception 'TEST: anonymous profile RPC was allowed'; end if;
  execute 'reset role';
  test_count := test_count + 1;
  perform pg_catalog.set_config('request.jwt.claim.sub','',true);
  perform pg_catalog.set_config('request.jwt.claims','{}',true);
  execute 'set local role authenticated';
  rejected := false;
  begin perform public.sideout_profile(); exception when insufficient_privilege then rejected := true; end;
  if not rejected then raise exception 'TEST: missing JWT was accepted'; end if;
  execute 'reset role';
  test_count := test_count + 1;

  foreach u in array array[a,b,c,d,outsider] loop
    insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
    values(u,'authenticated','authenticated','sideout-sql-'||u::text||'@example.invalid','',pg_catalog.now(),
      '{"provider":"email","providers":["email"]}'::jsonb,'{"name":"SQL Court Player"}'::jsonb,pg_catalog.now(),pg_catalog.now());
    perform pg_catalog.set_config('request.jwt.claim.sub',u::text,true);
    perform pg_catalog.set_config('request.jwt.claims',pg_catalog.jsonb_build_object('sub',u,'role','authenticated')::text,true);
    execute 'set local role authenticated';
    result := public.sideout_profile();
    if result->'avatarCreated' <> 'false'::jsonb or result->>'hairStyle' <> 'short' or result->>'name' <> 'SQL Court Player' then raise exception 'TEST: lazy defaults mismatch'; end if;
    rejected := false;
    begin perform public.sideout_play(); exception when raise_exception then rejected := true; end;
    if not rejected then raise exception 'TEST: incomplete avatar could play'; end if;
    perform public.sideout_save_profile('{"avatarCreated":true,"height":181,"bodyType":"regular"}'::jsonb);
    result := public.sideout_play();
    if result->'player'->>'code' !~ '^SO-[A-F0-9]{12}$' or (result->'player'->>'rating')::integer <> 1200 then raise exception 'TEST: player defaults mismatch'; end if;
    if (public.sideout_play()->'player'->>'code') <> result->'player'->>'code' then raise exception 'TEST: player code changed'; end if;
    if result->'player' ? 'email' or result->'player'->'avatar' ? 'email' then raise exception 'TEST: public email disclosure'; end if;
    if u = a then code_a := result->'player'->>'code';
    elsif u = b then code_b := result->'player'->>'code';
    elsif u = c then code_c := result->'player'->>'code';
    elsif u = d then code_d := result->'player'->>'code'; end if;
    execute 'reset role';
    test_count := test_count + 5;
  end loop;

  perform pg_catalog.set_config('request.jwt.claim.sub',a::text,true);
  perform pg_catalog.set_config('request.jwt.claims',pg_catalog.jsonb_build_object('sub',a,'role','authenticated')::text,true);
  execute 'set local role authenticated';
  -- Private schema, tables and helper functions cannot be called directly.
  rejected := false;
  begin execute 'select * from sideout.players'; exception when insufficient_privilege then rejected := true; end;
  if not rejected then raise exception 'TEST: private table readable'; end if;
  rejected := false;
  begin execute 'update sideout.players set rating = 9000'; exception when insufficient_privilege then rejected := true; end;
  if not rejected then raise exception 'TEST: rating table writable'; end if;
  rejected := false;
  begin perform sideout.player_view(b); exception when insufficient_privilege then rejected := true; end;
  if not rejected then raise exception 'TEST: private helper callable'; end if;
  test_count := test_count + 3;

  before_result := public.sideout_play()->'player';
  perform public.sideout_save_profile(pg_catalog.jsonb_build_object('name','Alpha','rating',999999,'games',333,'wins',333,'history',pg_catalog.jsonb_build_array(1),'user_id',b));
  result := public.sideout_play()->'player';
  if result->>'name' <> 'Alpha' or result->'rating' <> before_result->'rating' or result->'games' <> before_result->'games' then raise exception 'TEST: profile assigned server ratings'; end if;
  if public.sideout_profile()->'rating' <> '1200'::jsonb or public.sideout_profile()->'history' <> '[]'::jsonb then raise exception 'TEST: legacy demo fields are not inert'; end if;
  if public.sideout_player(code_b)->'player'->>'name' <> 'SQL Court Player' then raise exception 'TEST: forged profile owner changed another account'; end if;
  test_count := test_count + 3;

  -- Both genders accept only their own hairstyle catalog; type-only switching is safe.
  foreach style in array array['short','buzz','side-part','spiky','curly','afro'] loop
    perform public.sideout_save_profile(pg_catalog.jsonb_build_object('hairStyle',style));
    if public.sideout_profile()->>'hairStyle' <> style then raise exception 'TEST: male style did not persist'; end if;
    test_count := test_count + 1;
  end loop;
  rejected := false;
  begin perform public.sideout_save_profile('{"hairStyle":"ponytail"}'::jsonb); exception when raise_exception then rejected := true; end;
  if not rejected then raise exception 'TEST: male accepted female hair'; end if;
  perform public.sideout_save_profile('{"characterType":"female"}'::jsonb);
  if public.sideout_profile()->>'hairStyle' <> 'ponytail' then raise exception 'TEST: type-switch hair fallback failed'; end if;
  foreach style in array array['bob','long','ponytail','bun'] loop
    perform public.sideout_save_profile(pg_catalog.jsonb_build_object('hairStyle',style));
    if public.sideout_profile()->>'hairStyle' <> style then raise exception 'TEST: female style did not persist'; end if;
    test_count := test_count + 1;
  end loop;
  rejected := false;
  begin perform public.sideout_save_profile('{"hairStyle":"buzz"}'::jsonb); exception when raise_exception then rejected := true; end;
  if not rejected then raise exception 'TEST: female accepted male hair'; end if;
  foreach color in array array['#292727','#43352f','#87583c','#d6b66b','#b66a40','#b7b8ba'] loop
    perform public.sideout_save_profile(pg_catalog.jsonb_build_object('hairColor',color));
    if public.sideout_profile()->>'hairColor' <> color then raise exception 'TEST: hair color did not persist'; end if;
    test_count := test_count + 1;
  end loop;
  foreach item in array array['{"hairColor":"#000000"}','{"height":119}','{"height":220.5}','{"height":null}','{"bodyType":"giant"}','{"characterType":"other"}','{"avatarCreated":"true"}','{"capId":"not-a-cap"}','{"shirtId":"not-a-shirt"}','{"bottomId":"not-pants"}'] loop
    rejected := false;
    begin perform public.sideout_save_profile(item::jsonb); exception when raise_exception then rejected := true; end;
    if not rejected then raise exception 'TEST: invalid profile accepted: %',item; end if;
    test_count := test_count + 1;
  end loop;
  -- Every wardrobe slot is accepted, while real stats stay untouched.
  foreach item in array array['nike-court-cap','nike-night-cap','nike-coral-cap','nike-mesh-cap','nike-court-visor','adidas-three-cap','adidas-sky-cap','adidas-lilac-cap','adidas-sand-cap','adidas-reverse-cap'] loop
    perform public.sideout_save_profile(pg_catalog.jsonb_build_object('capId',item));
    if public.sideout_profile()->>'capId' <> item then raise exception 'TEST: cap did not persist'; end if;
    test_count := test_count + 1;
  end loop;
  foreach item in array array['nike-coral-tee','nike-night-tee','nike-cloud-tank','nike-club-polo','nike-lilac-zip','adidas-cream-tee','adidas-forest-jersey','adidas-sky-raglan','adidas-clay-polo','adidas-track-top'] loop
    perform public.sideout_save_profile(pg_catalog.jsonb_build_object('shirtId',item));
    if public.sideout_profile()->>'shirtId' <> item then raise exception 'TEST: shirt did not persist'; end if;
    test_count := test_count + 1;
  end loop;
  foreach item in array array['nike-field-shorts','nike-night-shorts','nike-sand-shorts','nike-coral-shorts','nike-cloud-shorts','adidas-three-shorts','adidas-moss-shorts','adidas-sky-shorts','adidas-lilac-shorts','adidas-clay-shorts','nike-night-joggers','nike-field-pants','nike-sand-cargo','nike-cloud-joggers','nike-lilac-pants','adidas-three-pants','adidas-forest-pants','adidas-sky-pants','adidas-clay-joggers','adidas-club-pants'] loop
    perform public.sideout_save_profile(pg_catalog.jsonb_build_object('bottomId',item));
    if public.sideout_profile()->>'bottomId' <> item then raise exception 'TEST: bottom did not persist'; end if;
    test_count := test_count + 1;
  end loop;
  if public.sideout_play()->'player'->'rating' <> '1200'::jsonb then raise exception 'TEST: clothing changed rating'; end if;
  execute 'reset role';
  test_count := test_count + 4;

  -- Controlled fixture ratings exercise the favorite +20 and underdog +40 caps.
  update sideout.players set rating = 1600 where user_id in(a,b);
  update sideout.players set rating = 1200 where user_id in(c,d);
  execute 'set local role authenticated';
  perform public.sideout_duo_invite(pg_catalog.lower(code_b));
  rejected := false;
  begin perform public.sideout_duo_invite(code_b); exception when raise_exception then rejected := true; end;
  if not rejected then raise exception 'TEST: duplicate invitation allowed'; end if;
  perform pg_catalog.set_config('request.jwt.claim.sub',b::text,true);
  invitation := (public.sideout_play()->'invitations'->0->>'id')::uuid;
  perform pg_catalog.set_config('request.jwt.claim.sub',outsider::text,true);
  rejected := false;
  begin perform public.sideout_duo_respond(invitation,true); exception when insufficient_privilege then rejected := true; end;
  if not rejected then raise exception 'TEST: outsider answered invitation'; end if;
  perform pg_catalog.set_config('request.jwt.claim.sub',b::text,true);
  result := public.sideout_duo_respond(invitation,true);
  if pg_catalog.jsonb_array_length(result->'duo'->'players') <> 2 then raise exception 'TEST: duo membership mismatch'; end if;
  perform pg_catalog.set_config('request.jwt.claim.sub',c::text,true);
  perform public.sideout_duo_invite(code_d);
  perform pg_catalog.set_config('request.jwt.claim.sub',d::text,true);
  invitation := (public.sideout_play()->'invitations'->0->>'id')::uuid;
  perform public.sideout_duo_respond(invitation,true);
  perform pg_catalog.set_config('request.jwt.claim.sub',outsider::text,true);
  rejected := false;
  begin perform public.sideout_duo_invite(code_b); exception when raise_exception then rejected := true; end;
  if not rejected then raise exception 'TEST: player joined two duos'; end if;
  test_count := test_count + 4;

  perform pg_catalog.set_config('request.jwt.claim.sub',a::text,true);
  result := public.sideout_match_create(code_c);
  select m.value into strict game_view from pg_catalog.jsonb_array_elements(result->'matches') m where m.value->>'status' = 'pending';
  game := (game_view->>'id')::uuid;
  if game_view->'preview' <> '{"a":20,"b":40}'::jsonb then raise exception 'TEST: favorite/underdog preview mismatch'; end if;
  if pg_catalog.jsonb_typeof(game_view->'createdAt') <> 'number' then raise exception 'TEST: timestamp not milliseconds number'; end if;
  rejected := false;
  begin perform public.sideout_match_result(game,'a'); exception when raise_exception then rejected := true; end;
  if not rejected then raise exception 'TEST: pending result allowed'; end if;
  rejected := false;
  begin perform public.sideout_match_respond(game,true); exception when insufficient_privilege then rejected := true; end;
  if not rejected then raise exception 'TEST: challenger accepted own challenge'; end if;
  perform pg_catalog.set_config('request.jwt.claim.sub',c::text,true);
  result := public.sideout_match_respond(game,true);
  select m.value into strict game_view from pg_catalog.jsonb_array_elements(result->'matches') m where (m.value->>'id')::uuid = game;
  if game_view->>'status' <> 'active' then raise exception 'TEST: acceptance did not activate'; end if;
  perform pg_catalog.set_config('request.jwt.claim.sub',a::text,true);
  rejected := false;
  begin perform public.sideout_duo_leave(); exception when raise_exception then rejected := true; end;
  if not rejected then raise exception 'TEST: active-game duo could leave'; end if;
  rejected := false;
  begin perform public.sideout_match_create(code_c); exception when raise_exception then rejected := true; end;
  if not rejected then raise exception 'TEST: simultaneous unfinished matches allowed'; end if;
  perform pg_catalog.set_config('request.jwt.claim.sub',outsider::text,true);
  rejected := false;
  begin perform public.sideout_match_result(game,'a'); exception when insufficient_privilege then rejected := true; end;
  if not rejected then raise exception 'TEST: outsider reported result'; end if;
  perform pg_catalog.set_config('request.jwt.claim.sub',b::text,true);
  result := public.sideout_match_result(game,'a');
  select m.value into strict game_view from pg_catalog.jsonb_array_elements(result->'matches') m where (m.value->>'id')::uuid = game;
  if game_view->>'status' <> 'completed' or (game_view->>'reportedBy')::uuid <> b or
     pg_catalog.jsonb_array_length(game_view->'deltas') <> 4 then raise exception 'TEST: one participant result mismatch'; end if;
  foreach u in array array[a,b,c,d] loop
    perform pg_catalog.set_config('request.jwt.claim.sub',u::text,true);
    result := public.sideout_play();
    if (result->'player'->>'rating')::bigint <> (case when u in(a,b) then 1620 else 1180 end) or
       (result->'player'->>'games')::integer <> 1 or
       (result->'player'->>'wins')::integer <> (case when u in(a,b) then 1 else 0 end) or
       pg_catalog.jsonb_array_length(result->'history') <> 1 then raise exception 'TEST: four-player rating/stat update failed'; end if;
    test_count := test_count + 1;
  end loop;
  rejected := false;
  begin perform public.sideout_match_result(game,'b'); exception when raise_exception then rejected := true; end;
  if not rejected then raise exception 'TEST: completed match replayed'; end if;
  if public.sideout_play()->'player'->'rating' <> '1180'::jsonb then raise exception 'TEST: replay changed rating'; end if;
  execute 'reset role';
  test_count := test_count + 10;

  -- A changed snapshot must roll back earlier player updates, not partially rate a match.
  update sideout.players set rating = 1600 where user_id in(a,b);
  update sideout.players set rating = 1200 where user_id in(c,d);
  perform pg_catalog.set_config('request.jwt.claim.sub',a::text,true);
  execute 'set local role authenticated';
  result := public.sideout_match_create(code_c);
  select m.value into strict game_view from pg_catalog.jsonb_array_elements(result->'matches') m where m.value->>'status' = 'pending';
  game := (game_view->>'id')::uuid;
  perform pg_catalog.set_config('request.jwt.claim.sub',d::text,true);
  perform public.sideout_match_respond(game,true);
  execute 'reset role';
  update sideout.players set rating = 1201 where user_id = d;
  execute 'set local role authenticated';
  rejected := false;
  begin perform public.sideout_match_result(game,'a'); exception when raise_exception then rejected := true; end;
  if not rejected then raise exception 'TEST: stale rating snapshot accepted'; end if;
  execute 'reset role';
  if exists(select 1 from sideout.players p where p.user_id in(a,b) and (p.rating <> 1600 or p.games <> 1)) then raise exception 'TEST: failed result partially applied'; end if;
  if (select m.status from sideout.matches m where m.id = game) <> 'active' then raise exception 'TEST: failed result changed match'; end if;
  update sideout.players set rating = 1200 where user_id = d;
  execute 'set local role authenticated';
  result := public.sideout_match_result(game,'b');
  if result->'player'->'rating' <> '1240'::jsonb then raise exception 'TEST: underdog winner did not gain 40'; end if;
  execute 'reset role';
  if exists(select 1 from sideout.players p where (p.user_id in(a,b) and p.rating <> 1560) or (p.user_id in(c,d) and p.rating <> 1240)) then raise exception 'TEST: underdog deltas mismatch'; end if;
  test_count := test_count + 4;

  -- Equal teams, high ratings above old demo ceiling, and minimum rating protection.
  update sideout.players set rating = 8000 where user_id in(a,b,c,d);
  perform pg_catalog.set_config('request.jwt.claim.sub',a::text,true);
  execute 'set local role authenticated';
  result := public.sideout_match_create(code_c);
  select m.value into strict game_view from pg_catalog.jsonb_array_elements(result->'matches') m where m.value->>'status' = 'pending';
  game := (game_view->>'id')::uuid;
  if game_view->'preview' <> '{"a":30,"b":30}'::jsonb then raise exception 'TEST: equal teams preview not 30'; end if;
  perform pg_catalog.set_config('request.jwt.claim.sub',c::text,true);
  perform public.sideout_match_respond(game,true);
  result := public.sideout_match_result(game,'a');
  execute 'reset role';
  if exists(select 1 from sideout.players p where (p.user_id in(a,b) and p.rating <> 8030) or (p.user_id in(c,d) and p.rating <> 7970)) then raise exception 'TEST: equal-team high ratings mismatch'; end if;
  update sideout.players set rating = 100 where user_id in(a,b,c,d);
  perform pg_catalog.set_config('request.jwt.claim.sub',a::text,true);
  execute 'set local role authenticated';
  result := public.sideout_match_create(code_c);
  select m.value into strict game_view from pg_catalog.jsonb_array_elements(result->'matches') m where m.value->>'status' = 'pending';
  game := (game_view->>'id')::uuid;
  perform pg_catalog.set_config('request.jwt.claim.sub',c::text,true);
  perform public.sideout_match_respond(game,true); perform public.sideout_match_result(game,'a');
  execute 'reset role';
  if exists(select 1 from sideout.players p where (p.user_id in(a,b) and p.rating <> 130) or (p.user_id in(c,d) and p.rating <> 100)) then raise exception 'TEST: rating floor mismatch'; end if;
  if sideout.award(9007199254740900,100) <> 20 or sideout.award(100,9007199254740900) <> 40 then raise exception 'TEST: extreme-rating award bounds'; end if;
  test_count := test_count + 4;

  -- Cancellation and expiry do not change ratings and free players to play again.
  perform pg_catalog.set_config('request.jwt.claim.sub',a::text,true);
  execute 'set local role authenticated';
  result := public.sideout_match_create(code_c);
  select m.value into strict game_view from pg_catalog.jsonb_array_elements(result->'matches') m where m.value->>'status' = 'pending';
  game := (game_view->>'id')::uuid;
  before_result := public.sideout_play()->'player';
  result := public.sideout_match_cancel(game);
  select m.value into strict game_view from pg_catalog.jsonb_array_elements(result->'matches') m where (m.value->>'id')::uuid = game;
  if result->'player' <> before_result or game_view->>'status' <> 'cancelled' then raise exception 'TEST: cancellation changed stats'; end if;
  result := public.sideout_match_create(code_c);
  select m.value into strict game_view from pg_catalog.jsonb_array_elements(result->'matches') m where m.value->>'status' = 'pending';
  game := (game_view->>'id')::uuid;
  execute 'reset role';
  update sideout.matches set expires_at = pg_catalog.now()-interval '1 second' where id = game;
  execute 'set local role authenticated';
  result := public.sideout_play();
  select m.value into strict game_view from pg_catalog.jsonb_array_elements(result->'matches') m where (m.value->>'id')::uuid = game;
  if game_view->>'status' <> 'cancelled' then raise exception 'TEST: expired challenge remains pending'; end if;
  perform pg_catalog.set_config('request.jwt.claim.sub',c::text,true);
  rejected := false;
  begin perform public.sideout_match_respond(game,true); exception when raise_exception then rejected := true; end;
  if not rejected then raise exception 'TEST: expired game accepted'; end if;
  result := public.sideout_duo_leave();
  if result->'duo' <> 'null'::jsonb then raise exception 'TEST: duo did not dissolve'; end if;
  perform pg_catalog.set_config('request.jwt.claim.sub',d::text,true);
  if public.sideout_play()->'duo' <> 'null'::jsonb then raise exception 'TEST: partner retained dissolved duo'; end if;
  perform public.sideout_duo_invite(code_c);
  execute 'reset role';
  update sideout.invitations set expires_at = pg_catalog.now()-interval '1 second' where from_id = d and to_id = c and status = 'pending' returning id into invitation;
  perform pg_catalog.set_config('request.jwt.claim.sub',c::text,true);
  execute 'set local role authenticated';
  if pg_catalog.jsonb_array_length(public.sideout_play()->'invitations') <> 0 then raise exception 'TEST: expired invite displayed'; end if;
  rejected := false;
  begin perform public.sideout_duo_respond(invitation,true); exception when raise_exception then rejected := true; end;
  if not rejected then raise exception 'TEST: expired invite accepted'; end if;
  execute 'reset role';
  test_count := test_count + 7;

  -- Verify schema-wide defense in depth and public RPC privilege allow-list.
  if exists(select 1 from pg_catalog.pg_class t join pg_catalog.pg_namespace n on n.oid = t.relnamespace where n.nspname = 'sideout' and t.relkind = 'r' and not t.relrowsecurity) then raise exception 'TEST: private table missing RLS'; end if;
  if exists(select 1 from pg_catalog.pg_proc f join pg_catalog.pg_namespace n on n.oid = f.pronamespace where n.nspname = 'public' and f.proname like 'sideout_%' and
    (not f.prosecdef or not ('search_path=""' = any(f.proconfig)) or pg_catalog.has_function_privilege('anon',f.oid,'EXECUTE') or not pg_catalog.has_function_privilege('authenticated',f.oid,'EXECUTE'))) then raise exception 'TEST: public RPC privilege/config mismatch'; end if;
  raise notice 'Sideout SQL acceptance checks passed: %; fixtures will be rolled back.',test_count + 2;
end
$test$;
rollback;
