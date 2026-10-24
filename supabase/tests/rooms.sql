-- Run after all migrations. All fixture accounts and game data roll back.
begin;

do $test$
<<room_fixture>>
declare
 users uuid[]:=array[pg_catalog.gen_random_uuid(),pg_catalog.gen_random_uuid(),pg_catalog.gen_random_uuid(),pg_catalog.gen_random_uuid(),pg_catalog.gen_random_uuid()];
 u uuid; room_id uuid; game_id uuid; next_game_id uuid; snapshot jsonb; rejected boolean;
 rules jsonb:='{"bestOf":1,"pointsToWin":11,"winBy":2}'::jsonb;
begin
 foreach u in array users loop
  insert into auth.users(id,raw_user_meta_data) values(u,'{"name":"Room fixture"}'::jsonb);
  perform sideout.ensure(u);update sideout.profiles set data=data||'{"avatarCreated":true}'::jsonb where user_id=u;
 end loop;
 execute 'set local role anon';
 rejected:=false;begin perform public.sideout_room('get');exception when insufficient_privilege then rejected:=true;end;
 if not rejected then raise exception 'TEST: anonymous room access';end if;
 execute 'set local role authenticated';
 perform pg_catalog.set_config('request.jwt.claim.sub',users[1]::text,true);
 snapshot:=public.sideout_room('create');room_id:=(snapshot->'room'->>'id')::uuid;
 if snapshot->'room'->>'leaderId'<>users[1]::text or pg_catalog.jsonb_array_length(snapshot->'room'->'slots')<>6 or snapshot->'room'->>'transferSlots'<>'2' then raise exception 'TEST: room creation';end if;
 for i in 2..4 loop
  perform pg_catalog.set_config('request.jwt.claim.sub',users[i]::text,true);
  perform public.sideout_room('slot',pg_catalog.jsonb_build_object('id',room_id,'slot',i-1));
 end loop;
 rejected:=false;begin perform public.sideout_room('start',pg_catalog.jsonb_build_object('id',room_id));exception when insufficient_privilege then rejected:=true;end;
 if not rejected then raise exception 'TEST: guest starts match';end if;
 rejected:=false;begin perform public.sideout_room('waiting',pg_catalog.jsonb_build_object('id',room_id));exception when others then rejected:=sqlerrm like '%Room action not found%';end;
 if not rejected then raise exception 'TEST: retired waiting action';end if;
 rejected:=false;begin perform public.sideout_room('slot',pg_catalog.jsonb_build_object('id',room_id,'slot',1));exception when others then rejected:=sqlerrm like '%Someone just took%';end;
 if not rejected then raise exception 'TEST: occupied slot accepted';end if;
 snapshot:=public.sideout_room('get',pg_catalog.jsonb_build_object('id',room_id));
 if snapshot->'room'->'slots'->3->>'id'<>users[4]::text then raise exception 'TEST: failed transfer lost old slot';end if;
 perform pg_catalog.set_config('request.jwt.claim.sub',users[5]::text,true);
 rejected:=false;begin perform public.sideout_room('slot',pg_catalog.jsonb_build_object('id',room_id,'slot',4));exception when others then rejected:=sqlerrm like '%only for players moving%';end;
 if not rejected then raise exception 'TEST: visitor entered transfer slot';end if;
 perform pg_catalog.set_config('request.jwt.claim.sub',users[1]::text,true);
 rejected:=false;begin perform public.sideout_room('slot',pg_catalog.jsonb_build_object('id',room_id,'slot',6));exception when others then rejected:=sqlerrm like '%Choose an available slot%';end;
 if not rejected then raise exception 'TEST: more than six positions';end if;
 perform public.sideout_room('slot',pg_catalog.jsonb_build_object('id',room_id,'slot',4));
 rejected:=false;begin perform public.sideout_room('start',pg_catalog.jsonb_build_object('id',room_id));exception when others then rejected:=sqlerrm like '%Fill all four playing slots%';end;
 if not rejected then raise exception 'TEST: started with unfilled playing position';end if;
 perform pg_catalog.set_config('request.jwt.claim.sub',users[5]::text,true);
 rejected:=false;begin perform public.sideout_room('slot',pg_catalog.jsonb_build_object('id',room_id,'slot',0));exception when others then rejected:=sqlerrm like '%already has four players%';end;
 if not rejected then raise exception 'TEST: fifth player took freed playing slot';end if;
 perform pg_catalog.set_config('request.jwt.claim.sub',users[3]::text,true);
 snapshot:=public.sideout_room('slot',pg_catalog.jsonb_build_object('id',room_id,'slot',5));
 if snapshot->'room'->'slots'->4->>'id'<>users[1]::text or snapshot->'room'->'slots'->5->>'id'<>users[3]::text then raise exception 'TEST: two transfer buffers';end if;
 perform public.sideout_room('slot',pg_catalog.jsonb_build_object('id',room_id,'slot',0));
 perform pg_catalog.set_config('request.jwt.claim.sub',users[1]::text,true);
 snapshot:=public.sideout_room('slot',pg_catalog.jsonb_build_object('id',room_id,'slot',2));
 if snapshot->'room'->'slots'->0->>'id'<>users[3]::text or snapshot->'room'->'slots'->2->>'id'<>users[1]::text then raise exception 'TEST: players failed to exchange positions';end if;
 snapshot:=public.sideout_room('start',pg_catalog.jsonb_build_object('id',room_id,'format','{"bestOf":5,"pointsToWin":21,"winBy":1}'::jsonb));game_id:=(snapshot->'room'->>'matchId')::uuid;
 if snapshot->'room'->'matchActive'<>'true'::jsonb then raise exception 'TEST: match did not start';end if;
 rejected:=false;begin perform public.sideout_room('close',pg_catalog.jsonb_build_object('id',room_id));exception when others then rejected:=sqlerrm like '%Finish or cancel%';end;
 if not rejected then raise exception 'TEST: closed active room';end if;
 perform pg_catalog.set_config('request.jwt.claim.sub',users[2]::text,true);
 rejected:=false;begin perform public.sideout_room('slot',pg_catalog.jsonb_build_object('id',room_id,'slot',4));exception when others then rejected:=sqlerrm like '%unfinished%';end;
 if not rejected then raise exception 'TEST: active player switched slots';end if;
 rejected:=false;begin perform public.sideout_match_result(game_id,'[{"a":11,"b":10}]'::jsonb);exception when others then rejected:=true;end;
 if not rejected then raise exception 'TEST: score accepted without required margin';end if;
 rejected:=false;begin perform public.sideout_match_result(game_id,'[{"a":11,"b":7},{"a":11,"b":8}]'::jsonb);exception when others then rejected:=true;end;
 if not rejected then raise exception 'TEST: multiple sets accepted';end if;
 perform public.sideout_match_result(game_id,'[{"a":12,"b":10}]'::jsonb);
 rejected:=false;begin perform public.sideout_match_result(game_id,'[{"a":12,"b":10}]'::jsonb);exception when others then rejected:=true;end;
 if not rejected then raise exception 'TEST: duplicate result';end if;
 perform public.sideout_room('slot',pg_catalog.jsonb_build_object('id',room_id,'slot',4));
 perform public.sideout_room('slot',pg_catalog.jsonb_build_object('id',room_id,'slot',1));
 perform pg_catalog.set_config('request.jwt.claim.sub',users[1]::text,true);
 snapshot:=public.sideout_room('start',pg_catalog.jsonb_build_object('id',room_id));next_game_id:=(snapshot->'room'->>'matchId')::uuid;
 perform public.sideout_match_cancel(next_game_id);
 perform public.sideout_room('close',pg_catalog.jsonb_build_object('id',room_id));
 execute 'reset role';
 if exists(select 1 from sideout.room_members n where n.room_id=room_fixture.room_id) then raise exception 'TEST: closed room retained memberships';end if;
 if (select format from sideout.matches where id=game_id)<>rules or (select format from sideout.matches where id=next_game_id)<>rules then raise exception 'TEST: room format is not fixed';end if;
 if (select games from sideout.players where user_id=users[5])<>0 then raise exception 'TEST: visitor rated';end if;
 if (select count(*) from sideout.players where user_id=any(users) and games=1)<>4 then raise exception 'TEST: wrong players rated';end if;
 if (select created_by from sideout.matches where id=game_id)<>users[1] then raise exception 'TEST: wrong room maker recorded';end if;
 if exists(select 1 from sideout.duo_members where user_id=any(users)) then raise exception 'TEST: rooms modified saved duos';end if;
 if pg_catalog.has_table_privilege('authenticated','sideout.rooms','select') or pg_catalog.has_table_privilege('authenticated','sideout.room_members','update') then raise exception 'TEST: direct table access';end if;
end $test$;
rollback;
