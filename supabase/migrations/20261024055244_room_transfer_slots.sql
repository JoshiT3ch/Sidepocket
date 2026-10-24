-- Four players per room; the two extra positions only let those players rearrange.
-- Stop before changing anything if an older room needs manual rearrangement.
-- No memberships, historical matches or active match formats are discarded.
-- The migration runner supplies the transaction; keep these locks until it ends.
lock table sideout.rooms,sideout.room_members in access exclusive mode;
do $$ begin
 if exists(select 1 from sideout.room_members where slot>=6) or
    exists(select 1 from sideout.room_members group by room_id having count(*)>4) then
  raise exception 'Existing rooms exceed four players or use extra slots. Close or rearrange those rooms before enabling transfer slots.';
 end if;
end $$;
update sideout.rooms set waiting_slots=2 where waiting_slots<>2;
alter table sideout.rooms add constraint sideout_room_two_transfer_slots check(waiting_slots=2);
alter table sideout.room_members add constraint sideout_room_slot_six_positions check(slot between 0 and 5);

create or replace function sideout.room_view(p_id uuid) returns jsonb
language sql stable set search_path = '' as $$
 select pg_catalog.jsonb_build_object('id',r.id,'leaderId',r.leader_id,'leader',sideout.player_view(r.leader_id),
  'waitingSlots',2,'transferSlots',2,'matchId',r.match_id,'matchActive',coalesce(m.status='active',false),
  'slots',(select pg_catalog.jsonb_agg(sideout.player_view(n.user_id) order by s.slot)
   from pg_catalog.generate_series(0,5) s(slot)
   left join sideout.room_members n on n.room_id=r.id and n.slot=s.slot))
 from sideout.rooms r left join sideout.matches m on m.id=r.match_id where r.id=p_id and r.closed_at is null
$$;

-- One authenticated gateway, matching the private-schema API used by the app.
create or replace function public.sideout_room(p_action text,p_data jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
 v_user uuid := sideout.me(); v_id uuid; v_room sideout.rooms; v_member sideout.room_members;
 v_slot integer; v_ids uuid[]; v_player uuid; v_a uuid; v_b uuid; v_match uuid; v_format jsonb; v_active boolean;
begin
 if pg_catalog.jsonb_typeof(p_data) is distinct from 'object' or pg_catalog.octet_length(p_data::text)>4096 then raise exception 'Please send valid room data.'; end if;
 perform sideout.ready(v_user);
 if p_action='get' then
  v_id := (p_data->>'id')::uuid;
  if v_id is null then select n.room_id into v_id from sideout.room_members n where n.user_id=v_user; end if;
  if v_id is not null and sideout.room_view(v_id) is null then raise exception 'This room is closed or unavailable. Ask the leader for a room QR.' using errcode='P0002'; end if;
  return pg_catalog.jsonb_build_object('room',sideout.room_view(v_id),'playerId',v_user);
 end if;
 if p_action='create' then
  perform sideout.lock_players(array[v_user]);
  if exists(select 1 from sideout.room_members n where n.user_id=v_user) then raise exception 'Leave or close your current room before making another room.'; end if;
  perform sideout.free(array[v_user]);
  insert into sideout.rooms(leader_id) values(v_user) returning id into v_id;
  insert into sideout.room_members(user_id,room_id,slot) values(v_user,v_id,0);
  return pg_catalog.jsonb_build_object('room',sideout.room_view(v_id),'playerId',v_user);
 end if;
 if p_action is null or p_action not in('slot','start','leave','close') then raise exception 'Room action not found.'; end if;
 v_id := (p_data->>'id')::uuid;
 -- Serialize occupancy and starts within a room; the unique user key prevents
 -- a player from claiming slots in two rooms, even across concurrent requests.
 select r.* into v_room from sideout.rooms r where r.id=v_id and r.closed_at is null for update;
 if not found then raise exception 'This room is closed or unavailable. Ask the leader for a room QR.' using errcode='P0002'; end if;
 select coalesce(m.status='active',false) into v_active from sideout.matches m where m.id=v_room.match_id;
 v_active := coalesce(v_active,false);
 if p_action='start' then
  select pg_catalog.array_agg(n.user_id order by n.slot) into v_ids from sideout.room_members n where n.room_id=v_id and n.slot<4;
  perform sideout.lock_players(coalesce(v_ids,array[]::uuid[])||array[v_user]);
 else
  perform sideout.lock_players(array[v_user]);
 end if;
 select n.* into v_member from sideout.room_members n where n.user_id=v_user;
 if p_action='slot' then
  if pg_catalog.jsonb_typeof(p_data->'slot') is distinct from 'number' or coalesce(p_data->>'slot','') !~ '^[0-9]{1,2}$' then raise exception 'Choose an available slot.'; end if;
  v_slot := (p_data->>'slot')::integer;
  if v_slot<0 or v_slot>=6 then raise exception 'Choose an available slot.'; end if;
  if v_member.room_id is not null and v_member.room_id<>v_id then raise exception 'Leave your current room before joining another room.'; end if;
  if v_member.room_id is null and v_slot>=4 then raise exception 'These two slots are only for players moving within this room. Choose a playing slot to join.'; end if;
  if v_member.room_id is null and (select count(*) from sideout.room_members n where n.room_id=v_id)>=4 then raise exception 'This room already has four players. The two extra + slots are only for transfers.'; end if;
  if v_member.room_id=v_id and v_member.slot=v_slot then return pg_catalog.jsonb_build_object('room',sideout.room_view(v_id),'playerId',v_user); end if;
  if exists(select 1 from sideout.room_members n where n.room_id=v_id and n.slot=v_slot) then raise exception 'Someone just took that slot. Refresh and choose another +.'; end if;
  perform sideout.free(array[v_user]);
  if v_active and (v_slot<4 or v_member.slot<4) then raise exception 'Playing slots stay fixed until the match finishes.'; end if;
  insert into sideout.room_members(user_id,room_id,slot) values(v_user,v_id,v_slot)
   on conflict(user_id) do update set slot=excluded.slot;
 else
  if v_member.room_id is distinct from v_id then raise exception 'Join this room first.' using errcode='42501'; end if;
  if p_action='leave' then
   if v_room.leader_id=v_user then raise exception 'The room leader must close the room.'; end if;
   perform sideout.free(array[v_user]);
   delete from sideout.room_members where user_id=v_user;
   return pg_catalog.jsonb_build_object('room',null,'playerId',v_user);
  end if;
  if v_room.leader_id<>v_user then raise exception 'Only the room leader can do that.' using errcode='42501'; end if;
  if p_action='close' then
   if v_active then raise exception 'Finish or cancel the match before closing the room.'; end if;
   delete from sideout.room_members where room_id=v_id;
   update sideout.rooms set closed_at=pg_catalog.now() where id=v_id;
   return pg_catalog.jsonb_build_object('room',null,'playerId',v_user);
  elsif p_action='start' then
   if v_active then raise exception 'This room already has a match in progress.'; end if;
   if coalesce(pg_catalog.array_length(v_ids,1),0)<>4 then raise exception 'Fill all four playing slots before starting.'; end if;
   foreach v_player in array v_ids loop perform sideout.ready(v_player); end loop;
   perform sideout.free(v_ids);v_format := '{"bestOf":1,"pointsToWin":11,"winBy":2}'::jsonb;
   -- Historical team rows satisfy existing match references without changing
   -- saved duos or duo invitations. All scoring uses the four-player snapshot.
   insert into sideout.duos(player_a,player_b,dissolved_at) values(v_ids[1],v_ids[2],pg_catalog.now()) returning id into v_a;
   insert into sideout.duos(player_a,player_b,dissolved_at) values(v_ids[3],v_ids[4],pg_catalog.now()) returning id into v_b;
   insert into sideout.matches(status,duo_a,duo_b,player_a1,player_a2,player_b1,player_b2,teams,created_by,format,room_id)
    values('active',v_a,v_b,v_ids[1],v_ids[2],v_ids[3],v_ids[4],
     pg_catalog.jsonb_build_object('a',pg_catalog.jsonb_build_array(sideout.player_view(v_ids[1]),sideout.player_view(v_ids[2])),
      'b',pg_catalog.jsonb_build_array(sideout.player_view(v_ids[3]),sideout.player_view(v_ids[4]))),v_user,v_format,v_id) returning id into v_match;
   update sideout.rooms set match_id=v_match where id=v_id;
  end if;
 end if;
 return pg_catalog.jsonb_build_object('room',sideout.room_view(v_id),'playerId',v_user);
end $$;

revoke all on function sideout.room_view(uuid) from public,anon,authenticated;
revoke all on function public.sideout_room(text,jsonb) from public,anon,authenticated;
grant execute on function public.sideout_room(text,jsonb) to authenticated;
