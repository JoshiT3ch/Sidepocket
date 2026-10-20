-- New matches may choose a fixed format and report complete set scores.
-- Existing matches retain NULL format/scores and their winner-only API.
create function sideout.match_format(p_format jsonb) returns jsonb
language plpgsql immutable set search_path = '' as $$
begin
  if pg_catalog.jsonb_typeof(p_format) is distinct from 'object' then raise exception 'Choose a valid match format.'; end if;
  if not (p_format ?& array['bestOf','pointsToWin','winBy']) or
     exists(select 1 from pg_catalog.jsonb_object_keys(p_format) k where k not in('bestOf','pointsToWin','winBy')) then
    raise exception 'Match format must contain only bestOf, pointsToWin and winBy.';
  end if;
  if pg_catalog.jsonb_typeof(p_format->'bestOf') is distinct from 'number' or
     pg_catalog.jsonb_typeof(p_format->'pointsToWin') is distinct from 'number' or
     pg_catalog.jsonb_typeof(p_format->'winBy') is distinct from 'number' then
    raise exception 'Match format values must be whole numbers.';
  end if;
  if (p_format->>'bestOf')::numeric not in(1,3,5) or
     (p_format->>'pointsToWin')::numeric not in(11,15,21) or
     (p_format->>'winBy')::numeric not in(1,2) then raise exception 'Choose a valid match format.'; end if;
  return pg_catalog.jsonb_build_object('bestOf',(p_format->>'bestOf')::integer,
    'pointsToWin',(p_format->>'pointsToWin')::integer,'winBy',(p_format->>'winBy')::integer);
end $$;

create function sideout.score_winner(p_format jsonb,p_scores jsonb) returns text
language plpgsql immutable set search_path = '' as $$
declare
  v_format jsonb := sideout.match_format(p_format); v_set jsonb;
  v_best integer := (v_format->>'bestOf')::integer; v_target integer := (v_format->>'pointsToWin')::integer;
  v_margin integer := (v_format->>'winBy')::integer; v_needed integer := (v_best+1)/2;
  v_a numeric; v_b numeric; v_high numeric; v_low numeric; v_expected numeric; v_wins_a integer := 0; v_wins_b integer := 0;
begin
  if pg_catalog.jsonb_typeof(p_scores) is distinct from 'array' then raise exception 'Enter the completed set scores.'; end if;
  if pg_catalog.jsonb_array_length(p_scores) not between 1 and v_best then raise exception 'Enter only the sets played in this match.'; end if;
  for v_set in select value from pg_catalog.jsonb_array_elements(p_scores) loop
    if v_wins_a >= v_needed or v_wins_b >= v_needed then raise exception 'Do not add sets after the match was won.'; end if;
    if pg_catalog.jsonb_typeof(v_set) is distinct from 'object' then raise exception 'Each set needs scores for both duos.'; end if;
    if not (v_set ?& array['a','b']) or exists(select 1 from pg_catalog.jsonb_object_keys(v_set) k where k not in('a','b')) then
      raise exception 'Each set must contain only a and b scores.';
    end if;
    if pg_catalog.jsonb_typeof(v_set->'a') is distinct from 'number' or pg_catalog.jsonb_typeof(v_set->'b') is distinct from 'number' then
      raise exception 'Set scores must be whole numbers from 0 to 99.';
    end if;
    v_a := (v_set->>'a')::numeric; v_b := (v_set->>'b')::numeric;
    if v_a not between 0 and 99 or v_b not between 0 and 99 or v_a <> pg_catalog.trunc(v_a) or v_b <> pg_catalog.trunc(v_b) then
      raise exception 'Set scores must be whole numbers from 0 to 99.';
    end if;
    if v_a = v_b then raise exception 'A completed set cannot be tied.'; end if;
    v_high := greatest(v_a,v_b); v_low := least(v_a,v_b);
    v_expected := case when v_margin = 1 or v_low <= v_target-v_margin then v_target else v_low+v_margin end;
    if v_high <> v_expected or v_high-v_low < v_margin then raise exception 'Enter a valid final score for each completed set.'; end if;
    if v_a > v_b then v_wins_a := v_wins_a+1; else v_wins_b := v_wins_b+1; end if;
  end loop;
  if v_wins_a = v_needed then return 'a'; elsif v_wins_b = v_needed then return 'b'; end if;
  raise exception 'Finish the match before recording its result.';
end $$;

alter table sideout.matches add column format jsonb,add column scores jsonb;
alter table sideout.matches add constraint sideout_match_format_valid check (format is null or sideout.match_format(format) = format),
  add constraint sideout_match_scores_valid check (scores is null or
    (format is not null and status = 'completed' and sideout.score_winner(format,scores) = winner_side)),
  add constraint sideout_formatted_result_scores check (format is null or status <> 'completed' or scores is not null);

create function sideout.keep_match_format() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.format is distinct from old.format then raise exception 'The match format cannot change after the challenge is created.'; end if;
  return new;
end $$;
create trigger sideout_match_format_immutable before update of format on sideout.matches
for each row execute function sideout.keep_match_format();

create or replace function sideout.match_view(p_match sideout.matches) returns jsonb language sql stable set search_path = '' as $$
  select pg_catalog.jsonb_build_object('id',p_match.id,
    'status',case when p_match.status = 'pending' and p_match.expires_at <= pg_catalog.now() then 'cancelled' else p_match.status end,
    'teams',p_match.teams,'createdBy',p_match.created_by,'createdAt',sideout.millis(p_match.created_at),
    'reportedBy',p_match.reported_by,'completedAt',sideout.millis(p_match.completed_at),
    'winnerSide',p_match.winner_side,'preview',sideout.preview(p_match.teams),'deltas',p_match.deltas,
    'format',p_match.format,'scores',p_match.scores)
$$;

create function public.sideout_match_create(p_code text,p_format jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_id uuid := sideout.me(); v_target uuid; v_a sideout.duos; v_b sideout.duos; v_ids uuid[]; v_player uuid; v_format jsonb;
begin
  perform sideout.ready(v_id); v_format := sideout.match_format(p_format); v_target := sideout.code_player(p_code);
  select d.* into v_a from sideout.duos d where d.id = sideout.duo_for(v_id);
  select d.* into v_b from sideout.duos d where d.id = sideout.duo_for(v_target);
  if v_a.id is null or v_b.id is null then raise exception 'Both sides must form a duo before playing doubles.'; end if;
  if v_a.id = v_b.id then raise exception 'Challenge a player from a different duo.'; end if;
  v_ids := array[v_a.player_a,v_a.player_b,v_b.player_a,v_b.player_b];
  perform sideout.lock_players(v_ids);
  if sideout.duo_for(v_id) is distinct from v_a.id or sideout.duo_for(v_target) is distinct from v_b.id then raise exception 'The original duos are no longer available.'; end if;
  foreach v_player in array v_ids loop perform sideout.ready(v_player); end loop;
  perform sideout.free(v_ids);
  insert into sideout.matches(duo_a,duo_b,player_a1,player_a2,player_b1,player_b2,teams,created_by,format)
  values(v_a.id,v_b.id,v_a.player_a,v_a.player_b,v_b.player_a,v_b.player_b,sideout.teams(v_a,v_b),v_id,v_format);
  return sideout.play_view(v_id);
end $$;

-- The gateways acquire the existing ordered player/match locks before this helper.
-- Apply the rating once to the whole match, preserving stale-snapshot rollback.
create function sideout.finish_match(p_match sideout.matches,p_reporter uuid,p_winner text,p_scores jsonb) returns void
language plpgsql set search_path = '' as $$
declare v_award integer; v_side text; v_member jsonb; v_player uuid; v_before bigint; v_after bigint;
  v_deltas jsonb := '[]'::jsonb; v_changed integer;
begin
  v_award := (sideout.preview(p_match.teams)->>p_winner)::integer;
  foreach v_side in array array['a','b'] loop
    for v_member in select e.value from pg_catalog.jsonb_array_elements(p_match.teams->v_side) e loop
      v_player := (v_member->>'id')::uuid; v_before := (v_member->>'rating')::bigint;
      v_after := greatest(100::bigint,v_before + case when v_side = p_winner then v_award else -v_award end);
      update sideout.players set rating = v_after,games = games+1,wins = wins + case when v_side = p_winner then 1 else 0 end
      where user_id = v_player and rating = v_before;
      get diagnostics v_changed = row_count;
      if v_changed <> 1 then raise exception 'A player rating changed. Cancel this game and create a new one.'; end if;
      v_deltas := v_deltas || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('playerId',v_player,'before',v_before,'after',v_after,'delta',v_after-v_before));
    end loop;
  end loop;
  update sideout.matches set status = 'completed',reported_by = p_reporter,completed_at = pg_catalog.now(),
    winner_side = p_winner,deltas = v_deltas,scores = p_scores where id = p_match.id;
end $$;

create or replace function public.sideout_match_result(p_id uuid,p_winner text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_id uuid := sideout.me(); v_match sideout.matches;
begin
  perform sideout.ready(v_id);
  if p_winner is null or p_winner not in('a','b') then raise exception 'Choose the duo that won.'; end if;
  v_match := sideout.lock_match(p_id,v_id);
  if v_match.status <> 'active' then raise exception 'Accept the game before submitting a result. Finished games cannot be submitted twice.'; end if;
  if v_match.format is not null then raise exception 'Enter the completed set scores for this match.'; end if;
  perform sideout.finish_match(v_match,v_id,p_winner,null);
  return sideout.play_view(v_id);
end $$;

-- Required p_scores distinguishes this overload from the winner-only gateway.
create function public.sideout_match_result(p_id uuid,p_scores jsonb,p_winner text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_id uuid := sideout.me(); v_match sideout.matches; v_winner text;
begin
  perform sideout.ready(v_id); v_match := sideout.lock_match(p_id,v_id);
  if v_match.status <> 'active' then raise exception 'Accept the game before submitting a result. Finished games cannot be submitted twice.'; end if;
  if v_match.format is null then raise exception 'Choose the winning duo for this legacy match.'; end if;
  v_winner := sideout.score_winner(v_match.format,p_scores);
  if p_winner is not null and p_winner is distinct from v_winner then raise exception 'The selected winner does not match the set scores.'; end if;
  perform sideout.finish_match(v_match,v_id,v_winner,p_scores);
  return sideout.play_view(v_id);
end $$;

revoke all on function sideout.match_format(jsonb),sideout.score_winner(jsonb,jsonb),sideout.keep_match_format(),
  sideout.finish_match(sideout.matches,uuid,text,jsonb) from public,anon,authenticated;
revoke all on function public.sideout_match_create(text,jsonb),public.sideout_match_result(uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.sideout_match_create(text,jsonb),public.sideout_match_result(uuid,jsonb,text) to authenticated;
