-- Isolated acceptance fixtures only: no real accounts, published sessions or verification grants survive.
begin;
do $test$
<<fixture>>
declare
 host_id uuid:=gen_random_uuid();a_id uuid:=gen_random_uuid();b_id uuid:=gen_random_uuid();visitor_id uuid:=gen_random_uuid();
 event_id uuid;other_event_id uuid;result jsonb;payload jsonb;blocked boolean;before_count integer;
 tomorrow text:=(((now() at time zone 'Asia/Manila')::date)+1)::text;
begin
 if has_function_privilege('anon','public.sideout_hosting(text,jsonb)','execute') then raise exception 'TEST hosting anonymous execution';end if;
 if not has_function_privilege('authenticated','public.sideout_hosting(text,jsonb)','execute') then raise exception 'TEST hosting missing authenticated grant';end if;
 if has_function_privilege('authenticated','sideout.hosting_event_view(sideout.hosted_events,uuid)','execute') then raise exception 'TEST hosting private helper grant';end if;
 if has_table_privilege('authenticated','sideout.hosted_events','select') or has_table_privilege('authenticated','sideout.hosting_participants','insert') or has_table_privilege('authenticated','sideout.player_verifications','insert') then raise exception 'TEST hosting direct table grants';end if;
 if (select prosecdef from pg_proc where oid='public.sideout_hosting(text,jsonb)'::regprocedure) then raise exception 'TEST hosting public gateway must use invoker';end if;
 if not (select relrowsecurity from pg_class where oid='sideout.hosted_events'::regclass) or not (select relrowsecurity from pg_class where oid='sideout.hosting_participants'::regclass) then raise exception 'TEST hosting RLS disabled';end if;
 insert into auth.users(id,email) values(host_id,'host@hosting.invalid'),(a_id,'alice@hosting.invalid'),(b_id,'bob@hosting.invalid'),(visitor_id,'visitor@hosting.invalid');
 foreach event_id in array array[host_id,a_id,b_id,visitor_id] loop
  perform sideout.ensure(event_id);
  update sideout.profiles set data=data||'{"avatarCreated":true,"isVerified":true,"verifiedUntil":"2099-01-01","email":"private@hosting.invalid","token":"private-token"}' where user_id=event_id;
 end loop;
 perform set_config('request.jwt.claim.sub',host_id::text,true);
 payload:=jsonb_build_object('title','Fixture doubles evening','category','men','capacity',2,'date',tomorrow,'startTime','19:00','endTime','22:00','venue','Fixture Valencia Court','address','Fixture address, Valencia City','fee',130,'notes','Rollback-only fixture.');
 result:=public.sideout_hosting('list',jsonb_build_object('scope','upcoming'));
 if (result->'me'->>'isVerified')::boolean then raise exception 'TEST hosting editable verification spoof';end if;
 blocked:=false;begin perform public.sideout_hosting('create',payload);exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'TEST hosting unverified create accepted';end if;
 insert into sideout.player_verifications(user_id,verified_until) values(host_id,now()+interval '1 month');
 execute 'set local role authenticated';
 result:=public.sideout_hosting('create',payload||jsonb_build_object('hostId',visitor_id,'confirmedCount',30));
 event_id:=(result->'selectedEvent'->>'id')::uuid;
 if (result->'selectedEvent'->'host'->>'id')::uuid<>host_id or (result->'selectedEvent'->>'confirmedCount')::integer<>1 or result->'selectedEvent'->>'myStatus'<>'confirmed' then raise exception 'TEST hosting host not auto-confirmed';end if;
 if (result->'selectedEvent'->>'startsAt')::timestamptz is distinct from ((tomorrow::date+time '19:00') at time zone 'Asia/Manila') or (result->'selectedEvent'->>'endsAt')::timestamptz is distinct from ((tomorrow::date+time '22:00') at time zone 'Asia/Manila') then raise exception 'TEST hosting timezone';end if;
 if (result->'selectedEvent'->>'fee')::integer<>130 then raise exception 'TEST hosting fee';end if;
 execute 'reset role';

 perform set_config('request.jwt.claim.sub',a_id::text,true);
 execute 'set local role authenticated';
 result:=public.sideout_hosting('request',jsonb_build_object('eventId',event_id,'userId',visitor_id,'status','confirmed'));
 if result->'selectedEvent'->>'myStatus'<>'requested' or (result->'selectedEvent'->>'confirmedCount')::integer<>1 or jsonb_array_length(result->'selectedEvent'->'requests')<>0 then raise exception 'TEST hosting request authority or privacy';end if;
 perform public.sideout_hosting('request',jsonb_build_object('eventId',event_id));
 result:=public.sideout_hosting('list',jsonb_build_object('scope','mine'));
 if jsonb_array_length(result->'events')<>1 then raise exception 'TEST hosting mine scope';end if;
 execute 'reset role';
 if (select count(*) from sideout.hosting_participants p where p.event_id=fixture.event_id and p.user_id=a_id)<>1 then raise exception 'TEST hosting duplicate request';end if;

 perform set_config('request.jwt.claim.sub',b_id::text,true);
 perform public.sideout_hosting('request',jsonb_build_object('eventId',event_id));
 blocked:=false;begin perform public.sideout_hosting('respond',jsonb_build_object('eventId',event_id,'userId',a_id,'accept',true));exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'TEST hosting nonhost approval';end if;
 blocked:=false;begin perform public.sideout_hosting('cancel',jsonb_build_object('eventId',event_id));exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'TEST hosting nonhost cancellation';end if;

 perform set_config('request.jwt.claim.sub',visitor_id::text,true);
 result:=public.sideout_hosting('list',jsonb_build_object('eventId',event_id));
 if jsonb_array_length(result->'selectedEvent'->'requests')<>0 or jsonb_array_length(result->'selectedEvent'->'participants')<>1 or result->'selectedEvent'->>'myStatus' is not null then raise exception 'TEST hosting pending applicant leak';end if;
 if result::text like '%private@hosting.invalid%' or result::text like '%private-token%' or result::text like '%verifiedUntil%' then raise exception 'TEST hosting private profile leak';end if;
 result:=public.sideout_hosting('list',jsonb_build_object('scope','mine'));if jsonb_array_length(result->'events')<>0 then raise exception 'TEST hosting mine scope leaks';end if;

 perform set_config('request.jwt.claim.sub',host_id::text,true);
 result:=public.sideout_hosting('list',jsonb_build_object('eventId',event_id));
 if jsonb_array_length(result->'selectedEvent'->'requests')<>2 then raise exception 'TEST hosting pending list missing';end if;
 perform public.sideout_hosting('respond',jsonb_build_object('eventId',event_id,'userId',a_id,'accept',true));
 result:=public.sideout_hosting('respond',jsonb_build_object('eventId',event_id,'userId',a_id,'accept',true));
 if (result->'selectedEvent'->>'confirmedCount')::integer<>2 then raise exception 'TEST hosting repeated approval';end if;
 blocked:=false;begin perform public.sideout_hosting('respond',jsonb_build_object('eventId',event_id,'userId',b_id,'accept',true));exception when others then blocked:=sqlerrm='This session is full.';end;
 if not blocked then raise exception 'TEST hosting overcapacity';end if;
 blocked:=false;begin perform public.sideout_hosting('rsvp',jsonb_build_object('eventId',event_id,'status','declined'));exception when others then blocked:=sqlerrm like 'The host stays confirmed%';end;
 if not blocked then raise exception 'TEST hosting host withdrawal';end if;
 perform set_config('request.jwt.claim.sub',visitor_id::text,true);
 blocked:=false;begin perform public.sideout_hosting('request',jsonb_build_object('eventId',event_id));exception when others then blocked:=sqlerrm='This session is full.';end;
 if not blocked then raise exception 'TEST hosting full request accepted';end if;
 perform set_config('request.jwt.claim.sub',a_id::text,true);
 perform public.sideout_hosting('request',jsonb_build_object('eventId',event_id));
 result:=public.sideout_hosting('rsvp',jsonb_build_object('eventId',event_id,'status','declined','userId',b_id));
 if (result->'selectedEvent'->>'confirmedCount')::integer<>1 or result->'selectedEvent'->>'myStatus'<>'declined' then raise exception 'TEST hosting self withdrawal';end if;
 perform set_config('request.jwt.claim.sub',host_id::text,true);
 update sideout.player_verifications set verified_until=now()-interval '1 second' where user_id=host_id;
 result:=public.sideout_hosting('respond',jsonb_build_object('eventId',event_id,'userId',b_id,'accept',true));
 if (result->'selectedEvent'->>'confirmedCount')::integer<>2 or (result->'me'->>'isVerified')::boolean then raise exception 'TEST hosting expiry strands approval';end if;
 blocked:=false;begin perform public.sideout_hosting('edit',payload||jsonb_build_object('eventId',event_id));exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'TEST hosting expired edit accepted';end if;
 blocked:=false;begin perform public.sideout_hosting('create',payload);exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'TEST hosting expired create accepted';end if;
 result:=public.sideout_hosting('cancel',jsonb_build_object('eventId',event_id));
 if result->'selectedEvent'->>'status'<>'cancelled' then raise exception 'TEST hosting cancel expired host';end if;
 perform public.sideout_hosting('cancel',jsonb_build_object('eventId',event_id));
 perform set_config('request.jwt.claim.sub',a_id::text,true);
 blocked:=false;begin perform public.sideout_hosting('request',jsonb_build_object('eventId',event_id));exception when others then blocked:=sqlerrm like '%cancelled%';end;
 if not blocked then raise exception 'TEST hosting cancelled request';end if;

 perform set_config('request.jwt.claim.sub',host_id::text,true);
 update sideout.player_verifications set verified_until=now()+interval '1 month' where user_id=host_id;
 select count(*) into before_count from sideout.hosted_events;
 foreach result in array array[
  payload||'{"date":"2026-02-30"}'::jsonb,payload||jsonb_build_object('date',((now() at time zone 'Asia/Manila')::date-1)::text),
  payload||jsonb_build_object('date',((now() at time zone 'Asia/Manila')::date+367)::text),
  payload||'{"startTime":"22:00","endTime":"02:00"}'::jsonb,payload||'{"startTime":"01:00","endTime":"23:00"}'::jsonb,
  payload||'{"startTime":"24:00"}'::jsonb,payload||'{"capacity":1}'::jsonb,payload||'{"capacity":101}'::jsonb,payload||'{"capacity":2.5}'::jsonb,payload||'{"capacity":"30"}'::jsonb,
  payload||'{"fee":-1}'::jsonb,payload||'{"fee":10001}'::jsonb,payload||'{"fee":1.5}'::jsonb,payload||'{"fee":"130"}'::jsonb,
  payload||'{"category":"invalid"}'::jsonb,payload||'{"title":"x"}'::jsonb,payload||jsonb_build_object('notes',repeat('x',1501))
 ] loop
  blocked:=false;begin perform public.sideout_hosting('create',result);exception when others then blocked:=true;end;
  if not blocked then raise exception 'TEST hosting invalid input accepted: %',result;end if;
 end loop;
 if (select count(*) from sideout.hosted_events)<>before_count then raise exception 'TEST hosting invalid input persisted';end if;
 result:=public.sideout_hosting('create',payload||'{"capacity":30,"fee":0}'::jsonb);other_event_id:=(result->'selectedEvent'->>'id')::uuid;
 result:=public.sideout_hosting('edit',payload||jsonb_build_object('eventId',other_event_id,'title','Edited fixture session','category','mixed','capacity',30,'fee',0));
 if result->'selectedEvent'->>'title'<>'Edited fixture session' or (result->'selectedEvent'->>'fee')::integer<>0 then raise exception 'TEST hosting edit';end if;
 perform set_config('request.jwt.claim.sub',a_id::text,true);perform public.sideout_hosting('request',jsonb_build_object('eventId',other_event_id));
 perform set_config('request.jwt.claim.sub',host_id::text,true);perform public.sideout_hosting('respond',jsonb_build_object('eventId',other_event_id,'userId',a_id,'accept',true));
 perform set_config('request.jwt.claim.sub',b_id::text,true);perform public.sideout_hosting('request',jsonb_build_object('eventId',other_event_id));
 perform set_config('request.jwt.claim.sub',host_id::text,true);perform public.sideout_hosting('respond',jsonb_build_object('eventId',other_event_id,'userId',b_id,'accept',true));
 blocked:=false;begin perform public.sideout_hosting('edit',payload||jsonb_build_object('eventId',other_event_id,'capacity',2));exception when others then blocked:=sqlerrm like 'Capacity cannot%';end;
 if not blocked then raise exception 'TEST hosting lower capacity';end if;
 perform set_config('request.jwt.claim.sub',a_id::text,true);
 result:=public.sideout_hosting('rsvp',jsonb_build_object('eventId',other_event_id,'status','maybe'));if result->'selectedEvent'->>'myStatus'<>'maybe' then raise exception 'TEST hosting Maybe';end if;
 perform public.sideout_hosting('request',jsonb_build_object('eventId',other_event_id));
 perform set_config('request.jwt.claim.sub',host_id::text,true);perform public.sideout_hosting('respond',jsonb_build_object('eventId',other_event_id,'userId',a_id,'accept',false));
 perform public.sideout_hosting('respond',jsonb_build_object('eventId',other_event_id,'userId',a_id,'accept',false));

 update sideout.hosted_events set starts_at=starts_at-interval '3 days',ends_at=ends_at-interval '3 days' where id=other_event_id;
 result:=public.sideout_hosting('list',jsonb_build_object('scope','past','eventId',other_event_id));
 if not exists(select 1 from jsonb_array_elements(result->'events') e where (e->>'id')::uuid=other_event_id) then raise exception 'TEST hosting past scope';end if;
 perform set_config('request.jwt.claim.sub',a_id::text,true);
 blocked:=false;begin perform public.sideout_hosting('request',jsonb_build_object('eventId',other_event_id));exception when others then blocked:=sqlerrm like '%ended%';end;
 if not blocked then raise exception 'TEST hosting ended request';end if;

 -- Deleting an attendee removes only their membership; deleting a host cascades their events.
 delete from auth.users where id=a_id;
 if exists(select 1 from sideout.hosting_participants where user_id=a_id) or not exists(select 1 from sideout.hosted_events where id=event_id) then raise exception 'TEST hosting attendee deletion cascade';end if;
 delete from auth.users where id=host_id;
 if exists(select 1 from sideout.hosted_events e where e.host_id=fixture.host_id) then raise exception 'TEST hosting host deletion cascade';end if;
 if exists(select 1 from sideout.hosting_participants p where p.event_id in (fixture.event_id,other_event_id)) then raise exception 'TEST hosting participant cascade';end if;
 perform set_config('request.jwt.claim.sub','',true);
 blocked:=false;begin perform public.sideout_hosting('list','{}');exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'TEST hosting missing authentication';end if;
end $test$;
rollback;
