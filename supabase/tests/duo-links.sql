-- Execute as database owner after the duo-links migration. No fixtures survive.
begin;
do $test$
declare
  a uuid := pg_catalog.gen_random_uuid(); b uuid := pg_catalog.gen_random_uuid();
  c uuid := pg_catalog.gen_random_uuid(); d uuid := pg_catalog.gen_random_uuid();
  e uuid := pg_catalog.gen_random_uuid(); unready uuid := pg_catalog.gen_random_uuid(); u uuid;
  first_link jsonb; owner_link jsonb; partner_link jsonb; result jsonb;
  duo uuid; invitation uuid; code_a text; code_b text; rejected boolean; item text;
begin
  execute 'set local role anon';
  rejected := false;
  begin perform public.sideout_duo_link_create(); exception when insufficient_privilege then rejected := true; end;
  if not rejected then raise exception 'TEST: anonymous created duo link'; end if;
  rejected := false;
  begin perform public.sideout_duo_link_join(pg_catalog.gen_random_uuid()::text); exception when insufficient_privilege then rejected := true; end;
  if not rejected then raise exception 'TEST: anonymous joined duo link'; end if;
  execute 'reset role';
  perform pg_catalog.set_config('request.jwt.claim.sub','',true);
  perform pg_catalog.set_config('request.jwt.claims','{}',true);
  execute 'set local role authenticated';
  rejected := false;
  begin perform public.sideout_duo_link_create(); exception when insufficient_privilege then rejected := true; end;
  if not rejected then raise exception 'TEST: missing identity created duo link'; end if;
  execute 'reset role';

  foreach u in array array[a,b,c,d,e,unready] loop
    insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
    values(u,'authenticated','authenticated','sideout-duo-link-'||u::text||'@example.invalid','',pg_catalog.now(),
      '{"provider":"email","providers":["email"]}'::jsonb,'{"name":"Duo Link Fixture"}'::jsonb,pg_catalog.now(),pg_catalog.now());
    perform pg_catalog.set_config('request.jwt.claim.sub',u::text,true);
    perform pg_catalog.set_config('request.jwt.claims',pg_catalog.jsonb_build_object('sub',u,'role','authenticated')::text,true);
    execute 'set local role authenticated';
    perform public.sideout_profile();
    if u <> unready then perform public.sideout_save_profile('{"avatarCreated":true}'::jsonb); end if;
    execute 'reset role';
  end loop;
  select p.code into code_a from sideout.players p where p.user_id = a;
  select p.code into code_b from sideout.players p where p.user_id = b;
  perform pg_catalog.set_config('request.jwt.claim.sub',unready::text,true);
  execute 'set local role authenticated';
  rejected := false;
  begin perform public.sideout_duo_link_create(); exception when raise_exception then rejected := true; end;
  if not rejected then raise exception 'TEST: incomplete avatar created link'; end if;

  perform pg_catalog.set_config('request.jwt.claim.sub',a::text,true);
  first_link := public.sideout_duo_link_create();
  if pg_catalog.jsonb_typeof(first_link->'expiresAt') <> 'number' or
    (first_link->>'expiresAt')::bigint not between pg_catalog.floor(extract(epoch from pg_catalog.clock_timestamp()+interval '23 hours')*1000)::bigint and pg_catalog.floor(extract(epoch from pg_catalog.clock_timestamp()+interval '24 hours')*1000)::bigint then
    raise exception 'TEST: invalid link expiry contract';
  end if;
  if (select pg_catalog.count(*) from pg_catalog.jsonb_object_keys(first_link)) <> 2 or
    first_link->>'token' !~ '^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' then
    raise exception 'TEST: invalid link payload';
  end if;
  rejected := false;
  begin perform public.sideout_duo_link_join(first_link->>'token'); exception when raise_exception then rejected := true; end;
  if not rejected then raise exception 'TEST: self link consumed'; end if;
  perform pg_catalog.set_config('request.jwt.claim.sub',unready::text,true);
  rejected := false;
  begin perform public.sideout_duo_link_join(first_link->>'token'); exception when raise_exception then rejected := true; end;
  if not rejected then raise exception 'TEST: incomplete avatar joined'; end if;
  perform pg_catalog.set_config('request.jwt.claim.sub',b::text,true);
  foreach item in array array['SO-123456ABCDEF','','not-a-token','00000000-0000-1000-8000-000000000000','00000000-0000-4000-7000-000000000000'] loop
    rejected := false;
    begin perform public.sideout_duo_link_join(item); exception when raise_exception then rejected := true; end;
    if not rejected then raise exception 'TEST: malformed token joined'; end if;
  end loop;
  rejected := false;
  begin perform public.sideout_duo_link_join(pg_catalog.gen_random_uuid()::text); exception when no_data_found then rejected := true; end;
  if not rejected then raise exception 'TEST: unknown token joined'; end if;
  perform pg_catalog.set_config('request.jwt.claim.sub',a::text,true);
  owner_link := public.sideout_duo_link_create();
  if owner_link->>'token' = first_link->>'token' then raise exception 'TEST: link did not rotate'; end if;
  perform pg_catalog.set_config('request.jwt.claim.sub',b::text,true);
  rejected := false;
  begin perform public.sideout_duo_link_join(first_link->>'token'); exception when raise_exception then rejected := true; end;
  if not rejected then raise exception 'TEST: replaced link joined'; end if;
  execute 'reset role';
  -- Keep the created_at/expiry ordering valid while making the link expired.
  update sideout.duo_links set created_at = pg_catalog.clock_timestamp()-interval '25 hours',expires_at = pg_catalog.clock_timestamp()-interval '1 hour'
  where token = (owner_link->>'token')::uuid;
  execute 'set local role authenticated';
  rejected := false;
  begin perform public.sideout_duo_link_join(owner_link->>'token'); exception when raise_exception then rejected := true; end;
  if not rejected then raise exception 'TEST: expired link joined'; end if;
  if public.sideout_play()->'duo' <> 'null'::jsonb then raise exception 'TEST: failed join created a duo'; end if;

  -- A successful link immediately creates the duo without a second invitation.
  perform pg_catalog.set_config('request.jwt.claim.sub',e::text,true);
  perform public.sideout_duo_invite(code_a);
  perform pg_catalog.set_config('request.jwt.claim.sub',a::text,true);
  owner_link := public.sideout_duo_link_create();
  perform pg_catalog.set_config('request.jwt.claim.sub',b::text,true);
  partner_link := public.sideout_duo_link_create();
  result := public.sideout_duo_link_join(pg_catalog.upper(owner_link->>'token'));
  duo := (result->'duo'->>'id')::uuid;
  if pg_catalog.jsonb_array_length(result->'duo'->'players') <> 2 or
    (result->'duo'->'players'->0->>'id')::uuid <> a or (result->'duo'->'players'->1->>'id')::uuid <> b then
    raise exception 'TEST: link formed wrong duo';
  end if;
  if (public.sideout_duo_link_join(owner_link->>'token')->'duo'->>'id')::uuid <> duo then raise exception 'TEST: retry changed duo'; end if;
  perform pg_catalog.set_config('request.jwt.claim.sub',a::text,true);
  if (public.sideout_play()->'duo'->>'id')::uuid <> duo or pg_catalog.jsonb_array_length(public.sideout_play()->'invitations') <> 0 then
    raise exception 'TEST: owner duo or invitation cleanup failed';
  end if;
  rejected := false;
  begin perform public.sideout_duo_link_create(); exception when raise_exception then rejected := true; end;
  if not rejected then raise exception 'TEST: occupied owner created a link'; end if;
  perform pg_catalog.set_config('request.jwt.claim.sub',c::text,true);
  rejected := false;
  begin perform public.sideout_duo_link_join(owner_link->>'token'); exception when raise_exception then rejected := true; end;
  if not rejected then raise exception 'TEST: third party reused claimed link'; end if;
  rejected := false;
  begin perform public.sideout_duo_link_join(partner_link->>'token'); exception when raise_exception then rejected := true; end;
  if not rejected then raise exception 'TEST: formed duo left other unused link valid'; end if;
  perform pg_catalog.set_config('request.jwt.claim.sub',b::text,true);
  perform public.sideout_duo_leave();
  rejected := false;
  begin perform public.sideout_duo_link_join(owner_link->>'token'); exception when raise_exception then rejected := true; end;
  if not rejected or public.sideout_play()->'duo' <> 'null'::jsonb then raise exception 'TEST: old link recreated a left duo'; end if;

  -- Ordinary invitations also revoke preexisting links permanently.
  perform pg_catalog.set_config('request.jwt.claim.sub',a::text,true);
  owner_link := public.sideout_duo_link_create();
  perform pg_catalog.set_config('request.jwt.claim.sub',b::text,true);
  partner_link := public.sideout_duo_link_create();
  perform pg_catalog.set_config('request.jwt.claim.sub',c::text,true);
  perform public.sideout_duo_invite(code_b);
  perform pg_catalog.set_config('request.jwt.claim.sub',b::text,true);
  invitation := (public.sideout_play()->'invitations'->0->>'id')::uuid;
  perform public.sideout_duo_respond(invitation,true);
  rejected := false;
  begin perform public.sideout_duo_link_join(owner_link->>'token'); exception when raise_exception then rejected := true; end;
  if not rejected then raise exception 'TEST: occupied recipient consumed another link'; end if;
  perform public.sideout_duo_leave();
  perform pg_catalog.set_config('request.jwt.claim.sub',d::text,true);
  rejected := false;
  begin perform public.sideout_duo_link_join(partner_link->>'token'); exception when raise_exception then rejected := true; end;
  if not rejected then raise exception 'TEST: invite then leave resurrected link'; end if;
  perform pg_catalog.set_config('request.jwt.claim.sub',b::text,true);
  result := public.sideout_duo_link_join(owner_link->>'token');
  duo := (result->'duo'->>'id')::uuid;
  execute 'reset role';
  update sideout.duo_links set created_at = pg_catalog.clock_timestamp()-interval '25 hours',expires_at = pg_catalog.clock_timestamp()-interval '1 hour'
  where token = (owner_link->>'token')::uuid;
  execute 'set local role authenticated';
  rejected := false;
  begin perform public.sideout_duo_link_join(owner_link->>'token'); exception when raise_exception then rejected := true; end;
  if not rejected or (public.sideout_play()->'duo'->>'id')::uuid <> duo then raise exception 'TEST: expired retry not rejected cleanly'; end if;
  perform public.sideout_duo_leave();
  execute 'reset role';

  -- Force a claim failure after the duo insert and ensure the RPC is atomic.
  execute 'create function pg_temp.sideout_block_duo_claim() returns trigger language plpgsql as $f$ begin raise exception ''fixture claim failure''; end $f$';
  execute 'create trigger sideout_test_block_claim before update of claimed_by on sideout.duo_links for each row execute function pg_temp.sideout_block_duo_claim()';
  perform pg_catalog.set_config('request.jwt.claim.sub',a::text,true);
  execute 'set local role authenticated';
  owner_link := public.sideout_duo_link_create();
  perform pg_catalog.set_config('request.jwt.claim.sub',b::text,true);
  rejected := false;
  begin perform public.sideout_duo_link_join(owner_link->>'token'); exception when raise_exception then rejected := true; end;
  if not rejected or public.sideout_play()->'duo' <> 'null'::jsonb then raise exception 'TEST: claim failure left a duo'; end if;
  execute 'reset role';
  if exists(select 1 from sideout.duo_links l where l.token = (owner_link->>'token')::uuid and (l.claimed_by is not null or l.duo_id is not null)) or
    exists(select 1 from sideout.duos d0 where d0.dissolved_at is null and a in(d0.player_a,d0.player_b)) then
    raise exception 'TEST: failed claim was partially committed';
  end if;
  execute 'drop trigger sideout_test_block_claim on sideout.duo_links';
  execute 'set local role authenticated';
  if public.sideout_duo_link_join(owner_link->>'token')->'duo' = 'null'::jsonb then raise exception 'TEST: failed claim consumed the link'; end if;

  -- Browser roles can use only the two gateways and cannot read capability rows.
  rejected := false;
  begin perform l.token from sideout.duo_links l; exception when insufficient_privilege then rejected := true; end;
  if not rejected then raise exception 'TEST: private links readable'; end if;
  rejected := false;
  begin perform sideout.duo_link_create(); exception when insufficient_privilege then rejected := true; end;
  if not rejected then raise exception 'TEST: private create helper callable'; end if;
  execute 'reset role';
  if not (select t.relrowsecurity from pg_catalog.pg_class t join pg_catalog.pg_namespace n on n.oid = t.relnamespace where n.nspname = 'sideout' and t.relname = 'duo_links') then
    raise exception 'TEST: links table missing RLS';
  end if;
  if pg_catalog.has_table_privilege('authenticated','sideout.duo_links','SELECT') or
    pg_catalog.has_table_privilege('anon','sideout.duo_links','SELECT') or
    pg_catalog.has_function_privilege('anon','public.sideout_duo_link_create()','EXECUTE') or
    pg_catalog.has_function_privilege('anon','public.sideout_duo_link_join(text)','EXECUTE') or
    not pg_catalog.has_function_privilege('authenticated','public.sideout_duo_link_create()','EXECUTE') or
    not pg_catalog.has_function_privilege('authenticated','public.sideout_duo_link_join(text)','EXECUTE') then
    raise exception 'TEST: link privileges mismatch';
  end if;
  if exists(select 1 from pg_catalog.pg_proc f join pg_catalog.pg_namespace n on n.oid = f.pronamespace
    where n.nspname = 'public' and f.proname in('sideout_duo_link_create','sideout_duo_link_join') and
    (not f.prosecdef or not ('search_path=""' = any(f.proconfig)))) then raise exception 'TEST: unsafe gateway configuration'; end if;
  raise notice 'Sideout duo-link SQL acceptance checks passed; fixtures will be rolled back.';
end
$test$;
rollback;
