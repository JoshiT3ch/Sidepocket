-- Run as the database owner after both migrations. All generated accounts roll back.
-- Existing players are never updated; expected ranks include any existing ladder.
begin;
do $test$
declare
  ids uuid[] := array[]::uuid[]; u uuid; i integer; a uuid; b uuid; c uuid; own uuid; newcomer uuid; unfinished uuid;
  result jsonb; first_result jsonb; entry jsonb; expected_rank bigint; baseline bigint; expected_order integer;
  rejected boolean; seen_a integer; seen_b integer; n integer := 0;
begin
  select pg_catalog.count(*) into baseline from sideout.players p join sideout.profiles f on f.user_id=p.user_id
    where p.games>0 and f.data->'avatarCreated'='true'::jsonb;

  execute 'set local role anon';
  rejected:=false;
  begin perform public.sideout_leaderboard(); exception when insufficient_privilege then rejected:=true; end;
  if not rejected then raise exception 'TEST: anonymous leaderboard allowed'; end if;
  execute 'reset role';
  perform pg_catalog.set_config('request.jwt.claim.sub','',true);
  perform pg_catalog.set_config('request.jwt.claims','{}',true);
  execute 'set local role authenticated';
  rejected:=false;
  begin perform public.sideout_leaderboard(); exception when insufficient_privilege then rejected:=true; end;
  if not rejected then raise exception 'TEST: missing identity allowed'; end if;
  execute 'reset role';
  u:=pg_catalog.gen_random_uuid();
  perform pg_catalog.set_config('request.jwt.claim.sub',u::text,true);
  perform pg_catalog.set_config('request.jwt.claims',pg_catalog.jsonb_build_object('sub',u,'role','authenticated')::text,true);
  execute 'set local role authenticated';
  rejected:=false;
  begin perform public.sideout_leaderboard(); exception when insufficient_privilege then rejected:=true; end;
  if not rejected then raise exception 'TEST: nonexistent account allowed'; end if;
  execute 'reset role';

  -- Four rated players, two ineligible players and 105 rated players above our low-rated account.
  for i in 1..111 loop
    u:=pg_catalog.gen_random_uuid();ids:=pg_catalog.array_append(ids,u);
    insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
    values(u,'authenticated','authenticated','sideout-leaderboard-'||u::text||'@example.invalid','',pg_catalog.now(),
      '{"provider":"email","providers":["email"]}'::jsonb,'{"name":"Leaderboard Fixture"}'::jsonb,pg_catalog.now(),pg_catalog.now());
    perform sideout.ensure(u);
    update sideout.profiles set data=data||'{"avatarCreated":true,"rating":4999,"games":999,"wins":999,"email":"private@example.invalid","token":"private-token"}'::jsonb where user_id=u;
    update sideout.players set rating=2000,games=2,wins=1 where user_id=u;
  end loop;
  a:=ids[1];b:=ids[2];c:=ids[3];own:=ids[4];newcomer:=ids[5];unfinished:=ids[6];
  update sideout.players set rating=9007199254740991,games=8,wins=5 where user_id=a;
  update sideout.players set rating=9007199254740991,games=10,wins=5 where user_id=b;
  update sideout.players set rating=9007199254740990 where user_id=c;
  update sideout.players set rating=100 where user_id=own;
  update sideout.players set rating=9007199254740991,games=0,wins=0 where user_id=newcomer;
  update sideout.players set rating=9007199254740991,games=50,wins=50 where user_id=unfinished;
  update sideout.profiles set data=pg_catalog.jsonb_set(data,'{avatarCreated}','false'::jsonb) where user_id=unfinished;

  -- Equal ratings share competition rank even when wins and games differ.
  foreach u in array array[a,b,c] loop
    perform pg_catalog.set_config('request.jwt.claim.sub',u::text,true);
    perform pg_catalog.set_config('request.jwt.claims',pg_catalog.jsonb_build_object('sub',u,'role','authenticated')::text,true);
    select 1+pg_catalog.count(*) into expected_rank from sideout.players p join sideout.profiles f on f.user_id=p.user_id
      where p.games>0 and f.data->'avatarCreated'='true'::jsonb and p.rating>(select q.rating from sideout.players q where q.user_id=u);
    execute 'set local role authenticated';result:=public.sideout_leaderboard();execute 'reset role';
    if (result->'me'->>'rank')::bigint<>expected_rank or result->'me'->'player'->>'id'<>u::text then raise exception 'TEST: competition rank or own identity mismatch'; end if;
    if u=a then first_result:=result; end if;
  end loop;
  if first_result->'me'->>'rank'<>'1' then raise exception 'TEST: highest legal rating did not rank first'; end if;
  if (first_result->>'rankedPlayers')::bigint<>baseline+109 or first_result->>'limit'<>'100' or pg_catalog.jsonb_array_length(first_result->'entries')<>100 then raise exception 'TEST: ladder count or cap mismatch'; end if;
  if (first_result->'me'->'player'->>'rating')::bigint<>9007199254740991 or first_result->'me'->'player'->>'games'<>'8' then raise exception 'TEST: profile demo stats assigned ladder statistics'; end if;

  -- Tie display order is wins DESC, games ASC, then code ASC. Verify every adjacent returned pair.
  entry:=null;
  for result in select e.value from pg_catalog.jsonb_array_elements(first_result->'entries') e loop
    if entry is not null then
      if (entry->'player'->>'rating')::bigint<(result->'player'->>'rating')::bigint then raise exception 'TEST: rating order reversed'; end if;
      if entry->'player'->'rating'=result->'player'->'rating' then
        if entry->'rank'<>result->'rank' then raise exception 'TEST: equal ratings received unequal ranks'; end if;
        if (entry->'player'->>'wins')::bigint<(result->'player'->>'wins')::bigint then raise exception 'TEST: win tie order reversed'; end if;
        if entry->'player'->'wins'=result->'player'->'wins' then
          if (entry->'player'->>'games')::bigint>(result->'player'->>'games')::bigint then raise exception 'TEST: games tie order reversed'; end if;
          if entry->'player'->'games'=result->'player'->'games' and entry->'player'->>'code'>result->'player'->>'code' then raise exception 'TEST: code tie order reversed'; end if;
        end if;
      end if;
    end if;
    entry:=result;n:=n+1;
    if result->'player'->>'id'=a::text then seen_a:=n; end if;
    if result->'player'->>'id'=b::text then seen_b:=n; end if;
    if result->'player'->>'id' in(newcomer::text,unfinished::text) then raise exception 'TEST: ineligible player ranked'; end if;
    if (select pg_catalog.count(*) from pg_catalog.jsonb_object_keys(result->'player'))<>7 or
       not(result->'player' ?& array['id','code','name','rating','games','wins','avatar']) or
       (select pg_catalog.count(*) from pg_catalog.jsonb_object_keys(result->'player'->'avatar'))<>12 or
       (result->'player'->'avatar') ?| array['email','token','history','avatarCreated','password_hash'] then raise exception 'TEST: private player data disclosed'; end if;
  end loop;
  if seen_a is not null and seen_b is not null and seen_a>=seen_b then raise exception 'TEST: deterministic games tie ordering failed'; end if;

  -- Me remains present and ranked below the top 100, including when other real players exist.
  perform pg_catalog.set_config('request.jwt.claim.sub',own::text,true);
  perform pg_catalog.set_config('request.jwt.claims',pg_catalog.jsonb_build_object('sub',own,'role','authenticated')::text,true);
  select 1+pg_catalog.count(*) into expected_rank from sideout.players p join sideout.profiles f on f.user_id=p.user_id
    where p.games>0 and f.data->'avatarCreated'='true'::jsonb and p.rating>100;
  execute 'set local role authenticated';result:=public.sideout_leaderboard();execute 'reset role';
  if (result->'me'->>'rank')::bigint<>expected_rank or expected_rank<=100 or
    exists(select 1 from pg_catalog.jsonb_array_elements(result->'entries') e where e.value->'player'->>'id'=own::text) then raise exception 'TEST: own position outside top 100 missing or included incorrectly'; end if;

  foreach u in array array[newcomer,unfinished] loop
    perform pg_catalog.set_config('request.jwt.claim.sub',u::text,true);
    perform pg_catalog.set_config('request.jwt.claims',pg_catalog.jsonb_build_object('sub',u,'role','authenticated')::text,true);
    execute 'set local role authenticated';result:=public.sideout_leaderboard();execute 'reset role';
    if result->'me'->'rank'<>'null'::jsonb or result->'me'->'player'->>'id'<>u::text then raise exception 'TEST: ineligible own player was ranked or missing'; end if;
  end loop;

  -- Client roles still cannot read private tables or assign ratings.
  execute 'set local role authenticated';rejected:=false;
  begin execute 'select * from sideout.players'; exception when insufficient_privilege then rejected:=true; end;
  if not rejected then raise exception 'TEST: private ladder table exposed'; end if;
  execute 'reset role';
  if pg_catalog.has_function_privilege('anon','public.sideout_leaderboard()','execute') or
    not pg_catalog.has_function_privilege('authenticated','public.sideout_leaderboard()','execute') then raise exception 'TEST: RPC grants mismatch'; end if;
end $test$;
select 'Leaderboard SQL acceptance checks passed'::text as result;
rollback;
