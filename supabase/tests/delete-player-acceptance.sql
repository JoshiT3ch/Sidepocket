-- OPERATOR-ONLY ROLLBACK FIXTURE. Never replace its final ROLLBACK with COMMIT.
-- Insert the marked helper definition from ../admin/delete-player.sql below.
-- admin/README.md has a single-request assembly recipe for SQL tools.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- SIDEOUT_DELETE_HELPER_INSERT

do $test$
declare
  target uuid := pg_catalog.gen_random_uuid();
  b uuid := pg_catalog.gen_random_uuid(); c uuid := pg_catalog.gen_random_uuid();
  d uuid := pg_catalog.gen_random_uuid(); e uuid := pg_catalog.gen_random_uuid();
  f uuid := pg_catalog.gen_random_uuid(); g uuid := pg_catalog.gen_random_uuid(); h uuid := pg_catalog.gen_random_uuid();
  all_users uuid[]; others uuid[]; u uuid; n integer := 0;
  target_duo uuid := pg_catalog.gen_random_uuid(); old_target_duo uuid := pg_catalog.gen_random_uuid();
  cd uuid := pg_catalog.gen_random_uuid(); ef uuid := pg_catalog.gen_random_uuid(); gh uuid := pg_catalog.gen_random_uuid();
  game_a1 uuid := pg_catalog.gen_random_uuid(); game_a2 uuid := pg_catalog.gen_random_uuid();
  game_b1 uuid := pg_catalog.gen_random_uuid(); game_b2 uuid := pg_catalog.gen_random_uuid();
  snapshot_game uuid := pg_catalog.gen_random_uuid(); delta_game uuid := pg_catalog.gen_random_uuid();
  unaffected_game uuid := pg_catalog.gen_random_uuid(); unaffected_invite uuid := pg_catalog.gen_random_uuid();
  unaffected_link uuid := pg_catalog.gen_random_uuid(); target_session uuid := pg_catalog.gen_random_uuid(); other_session uuid := pg_catalog.gen_random_uuid();
  target_flow uuid := pg_catalog.gen_random_uuid(); target_link_flow uuid := pg_catalog.gen_random_uuid(); other_flow uuid := pg_catalog.gen_random_uuid();
  target_code text; target_email text; result jsonb; rejected boolean;
  marker text := 'Delete ' || pg_catalog.substr(pg_catalog.replace(target::text,'-',''),1,16);
  before_auth jsonb; before_players jsonb; before_profiles jsonb; before_courts jsonb; before_friendships jsonb;
  before_match jsonb; before_invite jsonb; before_link jsonb; before_duos jsonb; before_members jsonb;
  before_other_identity jsonb; before_other_session jsonb; before_other_tokens jsonb; identity_row uuid;
  before_other_flow jsonb;
  now_at timestamptz := pg_catalog.clock_timestamp();
begin
  if pg_catalog.to_regprocedure('pg_temp.sideout_delete_player(uuid,text)') is null then
    raise exception 'Insert the actual helper at SIDEOUT_DELETE_HELPER_INSERT before running this fixture.';
  end if;
  all_users := array[target,b,c,d,e,f,g,h]; others := array[b,c,d,e,f,g,h];
  foreach u in array all_users loop
    n := n + 1;
    insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
    values(u,'authenticated','authenticated','sideout-deletion-'||u::text||'@example.invalid','',now_at,
      '{"provider":"facebook","providers":["facebook"]}'::jsonb,
      pg_catalog.jsonb_build_object('name',case when u = target then marker else 'Preserved Player '||n end,'fixture',true),now_at,now_at);
    perform sideout.ensure(u);
    update sideout.profiles set data = sideout.validate_profile(data ||
      pg_catalog.jsonb_build_object('avatarCreated',true,'characterType','female','hairStyle','ponytail',
        'height',183,'bodyType','broad','hairColor','#d6b66b','skin','#a96c4b','hat','headband',
        'shirtId','adidas-track-top','bottomId','nike-night-joggers','capId','adidas-lilac-cap')) where user_id = u;
    update sideout.players set rating = 1300+n*37,games = 20+n,wins = 8+n where user_id = u;
  end loop;
  select p.code into target_code from sideout.players p where p.user_id = target;
  select u.email into target_email from auth.users u where u.id = target;
  if (select p.data->>'height' from sideout.profiles p where p.user_id = target) <> '183' then
    raise exception 'TEST: nondefault avatar fixture not initialized';
  end if;

  -- Managed Auth rows plus both modern and legacy refresh-token shapes.
  insert into auth.identities(provider_id,user_id,identity_data,provider)
  values('sideout-deletion-'||target::text,target,pg_catalog.jsonb_build_object('sub','sideout-deletion-'||target::text,'email',target_email,'name',marker),'facebook');
  insert into auth.identities(provider_id,user_id,identity_data,provider)
  values('sideout-deletion-'||b::text,b,pg_catalog.jsonb_build_object('sub','sideout-deletion-'||b::text),'facebook') returning id into identity_row;
  insert into auth.sessions(id,user_id) values(target_session,target),(other_session,b);
  insert into auth.refresh_tokens(user_id,token,session_id,revoked) values
    (target::text,'sideout-deletion-bound-'||pg_catalog.gen_random_uuid()::text,target_session,false),
    (target::text,'sideout-deletion-legacy-'||pg_catalog.gen_random_uuid()::text,null,false),
    (b::text,'sideout-preserved-bound-'||pg_catalog.gen_random_uuid()::text,other_session,false),
    (b::text,'sideout-preserved-legacy-'||pg_catalog.gen_random_uuid()::text,null,false);
  insert into auth.flow_state(id,user_id,linking_target_id,provider_type,authentication_method,email_optional) values
    (target_flow,target,null,'facebook','oauth',false),
    (target_link_flow,b,target,'facebook','oauth',false),
    (other_flow,b,c,'facebook','oauth',false);

  insert into sideout.duos(id,player_a,player_b,dissolved_at) values
    (target_duo,target,b,null),(old_target_duo,c,target,now_at-interval '1 day'),
    (cd,c,d,null),(ef,e,f,null),(gh,g,h,null);
  insert into sideout.duo_members(user_id,duo_id) values
    (target,target_duo),(b,target_duo),(c,cd),(d,cd),(e,ef),(f,ef),(g,gh),(h,gh);
  insert into sideout.invitations(from_id,to_id) values(target,c),(d,target);
  insert into sideout.invitations(id,from_id,to_id) values(unaffected_invite,e,g);
  insert into sideout.duo_links(owner_id,claimed_by,duo_id) values
    (target,null,null),(target,b,target_duo),(b,target,target_duo);
  insert into sideout.duo_links(token,owner_id,claimed_by,duo_id) values(unaffected_link,e,f,ef);
  insert into sideout.court_checkins(user_id,court_id,status,open_play,checked_in_at,updated_at,expires_at) values
    (target,'paddle-grove','practice',true,now_at,now_at,now_at+interval '2 hours'),
    (b,'the-bodega','playing',false,now_at,now_at,now_at+interval '2 hours');

  insert into sideout.friendships(requester_id,recipient_id,status) values
    (target,b,'accepted'),(c,target,'pending'),(target,d,'declined'),(e,g,'accepted');
  select pg_catalog.to_jsonb(x) into before_friendships from sideout.friendships x where x.requester_id=e and x.recipient_id=g;

  -- All four participant slots, both duo sides, creator and reporter references.
  -- Stored snapshots include the target's nondefault avatar and name.
  insert into sideout.matches(id,status,duo_a,duo_b,player_a1,player_a2,player_b1,player_b2,teams,created_by,reported_by,completed_at,winner_side,deltas)
  select game_a1,'completed',target_duo,cd,target,b,c,d,sideout.teams(da,db),target,c,now_at,'a',
    pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('playerId',target,'before',1300,'after',1330,'delta',30))
  from sideout.duos da,sideout.duos db where da.id=target_duo and db.id=cd;
  insert into sideout.matches(id,status,duo_a,duo_b,player_a1,player_a2,player_b1,player_b2,teams,created_by,reported_by,completed_at,winner_side,deltas)
  select game_a2,'completed',old_target_duo,ef,c,target,e,f,sideout.teams(da,db),c,target,now_at,'a','[]'::jsonb
  from sideout.duos da,sideout.duos db where da.id=old_target_duo and db.id=ef;
  insert into sideout.matches(id,status,duo_a,duo_b,player_a1,player_a2,player_b1,player_b2,teams,created_by,reported_by,completed_at,winner_side,deltas)
  select game_b1,'completed',cd,target_duo,c,d,target,b,sideout.teams(da,db),c,target,now_at,'b','[]'::jsonb
  from sideout.duos da,sideout.duos db where da.id=cd and db.id=target_duo;
  insert into sideout.matches(id,status,duo_a,duo_b,player_a1,player_a2,player_b1,player_b2,teams,created_by,reported_by,completed_at,winner_side,deltas)
  select game_b2,'completed',gh,old_target_duo,g,h,c,target,sideout.teams(da,db),g,target,now_at,'b','[]'::jsonb
  from sideout.duos da,sideout.duos db where da.id=gh and db.id=old_target_duo;
  -- Legacy JSON-only references must also be removed, even without target FKs.
  insert into sideout.matches(id,status,duo_a,duo_b,player_a1,player_a2,player_b1,player_b2,teams,created_by,reported_by,completed_at,winner_side,deltas)
  select snapshot_game,'completed',ef,gh,e,f,g,h,
    pg_catalog.jsonb_set(sideout.teams(da,db),'{a,0}',sideout.player_view(target)),e,f,now_at,'a','[]'::jsonb
  from sideout.duos da,sideout.duos db where da.id=ef and db.id=gh;
  insert into sideout.matches(id,status,duo_a,duo_b,player_a1,player_a2,player_b1,player_b2,teams,created_by,reported_by,completed_at,winner_side,deltas)
  select delta_game,'completed',ef,gh,e,f,g,h,sideout.teams(da,db),e,f,now_at,'a',
    pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('playerId',target,'before',1300,'after',1330,'delta',30))
  from sideout.duos da,sideout.duos db where da.id=ef and db.id=gh;
  insert into sideout.matches(id,status,duo_a,duo_b,player_a1,player_a2,player_b1,player_b2,teams,created_by,reported_by,completed_at,winner_side,deltas)
  select unaffected_game,'completed',ef,gh,e,f,g,h,sideout.teams(da,db),e,f,now_at,'a','[]'::jsonb
  from sideout.duos da,sideout.duos db where da.id=ef and db.id=gh;

  -- Exact row snapshots detect unwanted account, cosmetic, aggregate or history changes.
  select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) order by x.id) into before_auth from auth.users x where x.id=any(others);
  select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) order by x.user_id) into before_players from sideout.players x where x.user_id=any(others);
  select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) order by x.user_id) into before_profiles from sideout.profiles x where x.user_id=any(others);
  select pg_catalog.to_jsonb(x) into before_courts from sideout.court_checkins x where x.user_id=b;
  select pg_catalog.to_jsonb(x) into before_match from sideout.matches x where x.id=unaffected_game;
  select pg_catalog.to_jsonb(x) into before_invite from sideout.invitations x where x.id=unaffected_invite;
  select pg_catalog.to_jsonb(x) into before_link from sideout.duo_links x where x.token=unaffected_link;
  select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) order by x.id) into before_duos from sideout.duos x where x.id=any(array[cd,ef,gh]);
  select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) order by x.user_id) into before_members from sideout.duo_members x where x.user_id=any(array[c,d,e,f,g,h]);
  select pg_catalog.to_jsonb(x) into before_other_identity from auth.identities x where x.id=identity_row;
  select pg_catalog.to_jsonb(x) into before_other_session from auth.sessions x where x.id=other_session;
  select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) order by x.id) into before_other_tokens from auth.refresh_tokens x where x.user_id=b::text;
  select pg_catalog.to_jsonb(x) into before_other_flow from auth.flow_state x where x.id=other_flow;

  -- Wrong/NULL confirmation and client-role execution must be rejected unchanged.
  rejected := false;
  begin perform pg_temp.sideout_delete_player(target,'DELETE '||b::text); exception when invalid_parameter_value then rejected:=true; end;
  if not rejected then raise exception 'TEST: mismatched confirmation accepted'; end if;
  rejected := false;
  begin perform pg_temp.sideout_delete_player(target,null); exception when invalid_parameter_value then rejected:=true; end;
  if not rejected then raise exception 'TEST: NULL confirmation accepted'; end if;
  execute 'set local role anon';
  rejected := false;
  begin perform pg_temp.sideout_delete_player(target,'DELETE '||target::text); exception when insufficient_privilege then rejected:=true; end;
  execute 'reset role';
  if not rejected then raise exception 'TEST: anonymous role invoked operator deletion'; end if;
  execute 'set local role authenticated';
  rejected := false;
  begin perform pg_temp.sideout_delete_player(target,'DELETE '||target::text); exception when insufficient_privilege then rejected:=true; end;
  execute 'reset role';
  if not rejected then raise exception 'TEST: client role invoked operator deletion'; end if;
  if not exists(select 1 from auth.users x where x.id=target) or not exists(select 1 from sideout.matches x where x.id=game_a1) then
    raise exception 'TEST: rejected call changed target data';
  end if;

  result := pg_temp.sideout_delete_player(target,'DELETE '||target::text);
  if result->'deleted'->>'authUsers' <> '1' or result->'deleted'->>'matches' <> '6'
    or result->'deleted'->>'friendships' <> '3' or result->'deleted'->>'duos' <> '2' or result->'deleted'->>'duoLinks' <> '3'
    or result->'deleted'->>'refreshTokens' <> '2' or result->'deleted'->>'authFlows' <> '2' or result->'deleted'->>'courtCheckins' <> '1'
    or result->'otherPlayerAggregatesChanged' <> 'false'::jsonb then raise exception 'TEST: deletion counts or contract incorrect'; end if;

  if exists(select 1 from auth.users x where x.id=target or x.email=target_email)
    or exists(select 1 from auth.identities x where x.user_id=target or x.identity_data->>'name'=marker)
    or exists(select 1 from auth.sessions x where x.user_id=target)
    or exists(select 1 from auth.refresh_tokens x where x.user_id=target::text)
    or exists(select 1 from auth.flow_state x where x.user_id=target or x.linking_target_id=target)
    or exists(select 1 from sideout.profiles x where x.user_id=target or x.data->>'name'=marker)
    or exists(select 1 from sideout.players x where x.user_id=target or x.code=target_code)
    or exists(select 1 from sideout.court_checkins x where x.user_id=target)
    or exists(select 1 from sideout.friendships x where x.requester_id=target or x.recipient_id=target)
    or exists(select 1 from sideout.invitations x where x.from_id=target or x.to_id=target)
    or exists(select 1 from sideout.duo_links x where x.owner_id=target or x.claimed_by=target or x.duo_id=any(array[target_duo,old_target_duo]))
    or exists(select 1 from sideout.duos x where x.player_a=target or x.player_b=target)
    or exists(select 1 from sideout.duo_members x where x.user_id=target or x.duo_id=any(array[target_duo,old_target_duo]))
    or exists(select 1 from sideout.matches x where x.id=any(array[game_a1,game_a2,game_b1,game_b2,snapshot_game,delta_game])
      or x.teams::text like '%'||target::text||'%' or x.teams::text like '%'||marker||'%'
      or x.deltas::text like '%'||target::text||'%') then raise exception 'TEST: target data or snapshot survived'; end if;

  if before_auth is distinct from (select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) order by x.id) from auth.users x where x.id=any(others))
    or before_players is distinct from (select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) order by x.user_id) from sideout.players x where x.user_id=any(others))
    or before_profiles is distinct from (select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) order by x.user_id) from sideout.profiles x where x.user_id=any(others))
    or before_friendships is distinct from (select pg_catalog.to_jsonb(x) from sideout.friendships x where x.requester_id=e and x.recipient_id=g)
    or before_courts is distinct from (select pg_catalog.to_jsonb(x) from sideout.court_checkins x where x.user_id=b)
    or before_match is distinct from (select pg_catalog.to_jsonb(x) from sideout.matches x where x.id=unaffected_game)
    or before_invite is distinct from (select pg_catalog.to_jsonb(x) from sideout.invitations x where x.id=unaffected_invite)
    or before_link is distinct from (select pg_catalog.to_jsonb(x) from sideout.duo_links x where x.token=unaffected_link)
    or before_duos is distinct from (select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) order by x.id) from sideout.duos x where x.id=any(array[cd,ef,gh]))
    or before_members is distinct from (select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) order by x.user_id) from sideout.duo_members x where x.user_id=any(array[c,d,e,f,g,h]))
    or before_other_identity is distinct from (select pg_catalog.to_jsonb(x) from auth.identities x where x.id=identity_row)
    or before_other_session is distinct from (select pg_catalog.to_jsonb(x) from auth.sessions x where x.id=other_session)
    or before_other_tokens is distinct from (select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) order by x.id) from auth.refresh_tokens x where x.user_id=b::text)
    or before_other_flow is distinct from (select pg_catalog.to_jsonb(x) from auth.flow_state x where x.id=other_flow) then
    raise exception 'TEST: another account, aggregate, Auth state, or unrelated record changed';
  end if;

  -- A still-unexpired JWT cannot lazily recreate the deleted profile: every
  -- public gateway checks that auth.users still contains the JWT subject.
  perform pg_catalog.set_config('request.jwt.claim.sub',target::text,true);
  perform pg_catalog.set_config('request.jwt.claims',pg_catalog.jsonb_build_object('sub',target,'role','authenticated')::text,true);
  execute 'set local role authenticated';
  rejected := false;
  begin perform public.sideout_profile(); exception when insufficient_privilege then rejected:=true; end;
  if not rejected then raise exception 'TEST: stale JWT recreated deleted profile'; end if;
  rejected := false;
  begin perform public.sideout_play(); exception when insufficient_privilege then rejected:=true; end;
  if not rejected then raise exception 'TEST: stale JWT accessed play'; end if;
  rejected := false;
  begin perform public.sideout_court_check_in('paddle-grove','playing','true'::jsonb); exception when insufficient_privilege then rejected:=true; end;
  if not rejected then raise exception 'TEST: stale JWT recreated court presence'; end if;
  execute 'reset role';
  if exists(select 1 from sideout.players x where x.user_id=target) or exists(select 1 from sideout.profiles x where x.user_id=target) then
    raise exception 'TEST: account reinitialized';
  end if;
  rejected := false;
  begin perform pg_temp.sideout_delete_player(target,'DELETE '||target::text); exception when no_data_found then rejected:=true; end;
  if not rejected then raise exception 'TEST: missing target was not rejected'; end if;
  raise notice 'PASS: deletion target/Auth/snapshots removed; other accounts, aggregate stats and unrelated records preserved; stale JWT denied. ROLLBACK follows.';
end
$test$;

select 'PASS: target live account and identifying game snapshots removed; preserved controls unchanged; stale JWT denied' as deletion_acceptance,
  'The surrounding transaction rolls back every fixture change.' as fixture_boundary;
rollback;
