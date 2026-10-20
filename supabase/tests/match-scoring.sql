-- Execute as database owner after all migrations. No fixture data survives.
begin;

do $rules$
declare
  scenario record; fmt jsonb; bad jsonb; rejected boolean; best integer; target integer; margin integer;
begin
  foreach best in array array[1,3,5] loop
    foreach target in array array[11,15,21] loop
      foreach margin in array array[1,2] loop
        fmt := pg_catalog.jsonb_build_object('bestOf',best,'pointsToWin',target,'winBy',margin);
        if sideout.match_format(fmt) <> fmt then raise exception 'TEST: valid format rejected'; end if;
      end loop;
    end loop;
  end loop;
  foreach bad in array array['null'::jsonb,'[]','1','{}','{"bestOf":3,"pointsToWin":11}',
    '{"bestOf":"3","pointsToWin":11,"winBy":2}','{"bestOf":2,"pointsToWin":11,"winBy":2}',
    '{"bestOf":3.5,"pointsToWin":11,"winBy":2}','{"bestOf":3,"pointsToWin":12,"winBy":2}',
    '{"bestOf":3,"pointsToWin":11,"winBy":3}','{"bestOf":true,"pointsToWin":11,"winBy":2}',
    '{"bestOf":3,"pointsToWin":11,"winBy":2,"extra":1}'] loop
    rejected := false;
    begin perform sideout.match_format(bad); exception when raise_exception then rejected := true; end;
    if not rejected then raise exception 'TEST: invalid format accepted: %',bad; end if;
  end loop;
  for scenario in select * from (values
    ('one set A',1,11,2,'[{"a":11,"b":9}]'::jsonb,'a'),
    ('one set B',1,11,2,'[{"a":9,"b":11}]','b'),
    ('deuce',1,11,2,'[{"a":12,"b":10}]','a'),
    ('long deuce',1,11,2,'[{"a":99,"b":97}]','a'),
    ('win by one',1,11,1,'[{"a":11,"b":10}]','a'),
    ('15 point set',1,15,2,'[{"a":15,"b":13}]','a'),
    ('21 point set',1,21,2,'[{"a":19,"b":21}]','b'),
    ('best of three sweep',3,11,2,'[{"a":11,"b":0},{"a":11,"b":8}]','a'),
    ('best of three deciding set',3,11,2,'[{"a":11,"b":8},{"a":9,"b":11},{"a":12,"b":10}]','a'),
    ('best of five sweep',5,11,2,'[{"a":0,"b":11},{"a":9,"b":11},{"a":10,"b":12}]','b'),
    ('best of five deciding set',5,15,1,'[{"a":15,"b":14},{"a":14,"b":15},{"a":15,"b":2},{"a":0,"b":15},{"a":15,"b":14}]','a')
  ) cases(label,best,target,margin,scores,winner) loop
    fmt := pg_catalog.jsonb_build_object('bestOf',scenario.best,'pointsToWin',scenario.target,'winBy',scenario.margin);
    if sideout.score_winner(fmt,scenario.scores) <> scenario.winner then raise exception 'TEST: score winner mismatch: %',scenario.label; end if;
  end loop;
  fmt := '{"bestOf":1,"pointsToWin":11,"winBy":1}';
  rejected := false;
  begin perform sideout.score_winner(fmt,'[{"a":12,"b":11}]'); exception when raise_exception then rejected := true; end;
  if not rejected then raise exception 'TEST: win-by-one allowed play beyond the target'; end if;
  raise notice 'Sideout match format and terminal score rules passed.';
end
$rules$;

do $api$
declare
  a uuid := pg_catalog.gen_random_uuid(); b uuid := pg_catalog.gen_random_uuid();
  c uuid := pg_catalog.gen_random_uuid(); d uuid := pg_catalog.gen_random_uuid(); outsider uuid := pg_catalog.gen_random_uuid(); u uuid;
  code_a text; code_b text; code_c text; code_d text; invite uuid; game uuid; legacy_game uuid;
  result jsonb; game_view jsonb; before_players jsonb; before_legacy jsonb; fmt jsonb := '{"bestOf":3,"pointsToWin":11,"winBy":2}';
  valid_scores jsonb := '[{"a":11,"b":8},{"a":9,"b":11},{"a":12,"b":10}]'; bad jsonb; rejected boolean;
begin
  execute 'set local role anon';
  rejected := false;
  begin perform public.sideout_match_create('SO-000000000000',fmt); exception when insufficient_privilege then rejected := true; end;
  if not rejected then raise exception 'TEST: anonymous formatted challenge allowed'; end if;
  rejected := false;
  begin perform public.sideout_match_result(a,valid_scores); exception when insufficient_privilege then rejected := true; end;
  if not rejected then raise exception 'TEST: anonymous scored result allowed'; end if;
  execute 'reset role';
  perform pg_catalog.set_config('request.jwt.claim.sub','',true);
  perform pg_catalog.set_config('request.jwt.claims','{}',true);
  execute 'set local role authenticated';
  rejected := false;
  begin perform public.sideout_match_create('SO-000000000000',fmt); exception when insufficient_privilege then rejected := true; end;
  if not rejected then raise exception 'TEST: formatted challenge without identity allowed'; end if;
  rejected := false;
  begin perform public.sideout_match_result(a,valid_scores); exception when insufficient_privilege then rejected := true; end;
  if not rejected then raise exception 'TEST: scored result without identity allowed'; end if;
  execute 'reset role';

  foreach u in array array[a,b,c,d,outsider] loop
    insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
    values(u,'authenticated','authenticated','sideout-scoring-'||u::text||'@example.invalid','',pg_catalog.now(),
      '{"provider":"email","providers":["email"]}','{"name":"Scoring Player"}',pg_catalog.now(),pg_catalog.now());
    perform pg_catalog.set_config('request.jwt.claim.sub',u::text,true);
    execute 'set local role authenticated';
    perform public.sideout_profile(); perform public.sideout_save_profile('{"avatarCreated":true}'); result := public.sideout_play();
    if u = a then code_a := result->'player'->>'code'; elsif u = b then code_b := result->'player'->>'code';
    elsif u = c then code_c := result->'player'->>'code'; elsif u = d then code_d := result->'player'->>'code'; end if;
    execute 'reset role';
  end loop;
  perform pg_catalog.set_config('request.jwt.claim.sub',a::text,true); execute 'set local role authenticated';
  perform public.sideout_duo_invite(code_b); perform pg_catalog.set_config('request.jwt.claim.sub',b::text,true);
  invite := (public.sideout_play()->'invitations'->0->>'id')::uuid; perform public.sideout_duo_respond(invite,true);
  perform pg_catalog.set_config('request.jwt.claim.sub',c::text,true); perform public.sideout_duo_invite(code_d);
  perform pg_catalog.set_config('request.jwt.claim.sub',d::text,true);
  invite := (public.sideout_play()->'invitations'->0->>'id')::uuid; perform public.sideout_duo_respond(invite,true);

  -- Legacy clients keep their original create and winner-only result signatures.
  perform pg_catalog.set_config('request.jwt.claim.sub',a::text,true); result := public.sideout_match_create(code_c);
  select e.value into strict game_view from pg_catalog.jsonb_array_elements(result->'matches') e where e.value->>'status' = 'pending';
  legacy_game := (game_view->>'id')::uuid;
  if game_view->'format' <> 'null'::jsonb or game_view->'scores' <> 'null'::jsonb then raise exception 'TEST: legacy match gained a scoring format'; end if;
  perform pg_catalog.set_config('request.jwt.claim.sub',c::text,true); perform public.sideout_match_respond(legacy_game,true);
  rejected := false;
  begin perform public.sideout_match_result(legacy_game,valid_scores); exception when raise_exception then rejected := true; end;
  if not rejected then raise exception 'TEST: legacy match accepted set scores'; end if;
  perform public.sideout_match_result(p_id => legacy_game,p_winner => 'a'); execute 'reset role';
  select pg_catalog.to_jsonb(m) into before_legacy from sideout.matches m where m.id = legacy_game;

  update sideout.players set rating = case when user_id in(a,b) then 1200 else 1300 end where user_id in(a,b,c,d);
  perform pg_catalog.set_config('request.jwt.claim.sub',a::text,true); execute 'set local role authenticated';
  rejected := false;
  begin perform public.sideout_match_create(code_c,null::jsonb); exception when raise_exception then rejected := true; end;
  if not rejected then raise exception 'TEST: explicitly null format accepted'; end if;
  rejected := false;
  begin perform public.sideout_match_create(code_c,'{"bestOf":3,"pointsToWin":11,"winBy":2,"extra":1}'); exception when raise_exception then rejected := true; end;
  if not rejected then raise exception 'TEST: malformed format accepted through gateway'; end if;
  result := public.sideout_match_create(p_code => code_c,p_format => fmt);
  select e.value into strict game_view from pg_catalog.jsonb_array_elements(result->'matches') e where e.value->>'status' = 'pending';
  game := (game_view->>'id')::uuid;
  if game_view->'format' <> fmt or game_view->'scores' <> 'null'::jsonb or game_view->'preview' <> '{"a":40,"b":20}'::jsonb then raise exception 'TEST: formatted challenge snapshot mismatch'; end if;
  rejected := false;
  begin perform public.sideout_match_result(game,valid_scores); exception when raise_exception then rejected := true; end;
  if not rejected then raise exception 'TEST: unaccepted match accepted scores'; end if;
  execute 'reset role';
  rejected := false;
  begin update sideout.matches set format = '{"bestOf":1,"pointsToWin":15,"winBy":1}' where id = game; exception when raise_exception then rejected := true; end;
  if not rejected then raise exception 'TEST: challenge format was mutable'; end if;
  perform pg_catalog.set_config('request.jwt.claim.sub',c::text,true); execute 'set local role authenticated';
  result := public.sideout_match_respond(game,true);
  select e.value into strict game_view from pg_catalog.jsonb_array_elements(result->'matches') e where (e.value->>'id')::uuid = game;
  if game_view->'format' <> fmt then raise exception 'TEST: accepting changed match format'; end if;
  perform pg_catalog.set_config('request.jwt.claim.sub',outsider::text,true);
  rejected := false;
  begin perform public.sideout_match_result(game,valid_scores); exception when insufficient_privilege then rejected := true; end;
  if not rejected then raise exception 'TEST: outsider submitted scores'; end if;
  perform pg_catalog.set_config('request.jwt.claim.sub',a::text,true);
  rejected := false;
  begin perform public.sideout_match_result(game,'a'); exception when raise_exception then rejected := true; end;
  if not rejected then raise exception 'TEST: winner-only API bypassed required scores'; end if;
  rejected := false;
  begin perform public.sideout_match_result(game,valid_scores,'b'); exception when raise_exception then rejected := true; end;
  if not rejected then raise exception 'TEST: forged winner overrode scores'; end if;
  execute 'reset role';
  select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(p) order by p.user_id) into before_players from sideout.players p where p.user_id in(a,b,c,d);
  execute 'set local role authenticated';
  foreach bad in array array[null::jsonb,'null'::jsonb,'{}','[]','[null]','[[]]','[{"a":11}]','[{"a":11,"b":0,"extra":1}]',
    '[{"a":"11","b":0}]','[{"a":true,"b":0}]','[{"a":null,"b":0}]','[{"a":11.5,"b":0}]','[{"a":-1,"b":11}]','[{"a":100,"b":98}]','[{"a":11,"b":11}]',
    '[{"a":11,"b":8}]','[{"a":11,"b":0},{"a":11,"b":0},{"a":11,"b":0}]',
    '[{"a":11,"b":0},{"a":0,"b":11},{"a":11,"b":0},{"a":11,"b":0}]',
    '[{"a":12,"b":0},{"a":11,"b":0}]','[{"a":20,"b":5},{"a":11,"b":0}]',
    '[{"a":10,"b":8},{"a":11,"b":0}]','[{"a":11,"b":10},{"a":11,"b":0}]','[{"a":12,"b":9},{"a":11,"b":0}]','[{"a":13,"b":10},{"a":11,"b":0}]'] loop
    rejected := false;
    begin perform public.sideout_match_result(game,bad); exception when raise_exception then rejected := true; end;
    if not rejected then raise exception 'TEST: malformed/incomplete/extra scores accepted: %',bad; end if;
    execute 'reset role';
    if (select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(p) order by p.user_id) from sideout.players p where p.user_id in(a,b,c,d)) <> before_players or
       exists(select 1 from sideout.matches m where m.id = game and (m.status <> 'active' or m.scores is not null or m.deltas is not null)) then
      raise exception 'TEST: rejected scores changed game or player stats';
    end if;
    execute 'set local role authenticated';
  end loop;
  execute 'reset role';

  -- A late snapshot mismatch must also roll back earlier players and score data.
  update sideout.players set rating = 1301 where user_id = d; execute 'set local role authenticated';
  rejected := false;
  begin perform public.sideout_match_result(game,valid_scores); exception when raise_exception then rejected := true; end;
  if not rejected then raise exception 'TEST: stale scoring snapshot accepted'; end if;
  execute 'reset role';
  if exists(select 1 from sideout.players p where p.user_id in(a,b,c,d) and (p.games <> 1 or p.rating <> case when p.user_id in(a,b) then 1200 when p.user_id = d then 1301 else 1300 end)) or
     exists(select 1 from sideout.matches m where m.id = game and (m.status <> 'active' or m.scores is not null)) then raise exception 'TEST: scored result partially committed'; end if;
  update sideout.players set rating = 1300 where user_id = d;
  perform pg_catalog.set_config('request.jwt.claim.sub',b::text,true); execute 'set local role authenticated';
  result := public.sideout_match_result(p_id => game,p_scores => valid_scores,p_winner => 'a');
  select e.value into strict game_view from pg_catalog.jsonb_array_elements(result->'history') e where (e.value->>'id')::uuid = game;
  if game_view->>'winnerSide' <> 'a' or game_view->'scores' <> valid_scores or game_view->'format' <> fmt or
     pg_catalog.jsonb_array_length(game_view->'deltas') <> 4 then raise exception 'TEST: scored history mismatch'; end if;
  rejected := false;
  begin perform public.sideout_match_result(game,valid_scores); exception when raise_exception then rejected := true; end;
  if not rejected then raise exception 'TEST: scored match rated twice'; end if;
  execute 'reset role';
  if exists(select 1 from sideout.players p where p.user_id in(a,b,c,d) and
    (p.games <> 2 or p.rating <> case when p.user_id in(a,b) then 1240 else 1260 end or p.wins <> case when p.user_id in(a,b) then 2 else 0 end)) then
    raise exception 'TEST: match scores applied rating once per set instead of once per match';
  end if;
  if (select pg_catalog.to_jsonb(m) from sideout.matches m where m.id = legacy_game) <> before_legacy then raise exception 'TEST: historical legacy match changed'; end if;

  -- Omitted winner is derived for the opposite side and a different format.
  perform pg_catalog.set_config('request.jwt.claim.sub',a::text,true); execute 'set local role authenticated';
  result := public.sideout_match_create(code_c,'{"bestOf":1,"pointsToWin":15,"winBy":1}');
  select e.value into strict game_view from pg_catalog.jsonb_array_elements(result->'matches') e where e.value->>'status' = 'pending';
  game := (game_view->>'id')::uuid; perform pg_catalog.set_config('request.jwt.claim.sub',c::text,true);
  perform public.sideout_match_respond(game,true); result := public.sideout_match_result(game,'[{"a":14,"b":15}]'::jsonb);
  select e.value into strict game_view from pg_catalog.jsonb_array_elements(result->'history') e where (e.value->>'id')::uuid = game;
  if game_view->>'winnerSide' <> 'b' or game_view->'scores' <> '[{"a":14,"b":15}]'::jsonb then raise exception 'TEST: derived side-B result mismatch'; end if;
  execute 'reset role';

  if pg_catalog.has_function_privilege('anon','public.sideout_match_create(text,jsonb)','EXECUTE') or
     pg_catalog.has_function_privilege('anon','public.sideout_match_result(uuid,jsonb,text)','EXECUTE') or
     not pg_catalog.has_function_privilege('authenticated','public.sideout_match_create(text,jsonb)','EXECUTE') or
     not pg_catalog.has_function_privilege('authenticated','public.sideout_match_result(uuid,jsonb,text)','EXECUTE') or
     pg_catalog.has_function_privilege('authenticated','sideout.score_winner(jsonb,jsonb)','EXECUTE') or
     pg_catalog.has_function_privilege('authenticated','sideout.finish_match(sideout.matches,uuid,text,jsonb)','EXECUTE') then
    raise exception 'TEST: scoring gateway/helper privileges mismatch';
  end if;
  raise notice 'Sideout scoring API checks passed; all fixture accounts and games will be rolled back.';
end
$api$;
rollback;
