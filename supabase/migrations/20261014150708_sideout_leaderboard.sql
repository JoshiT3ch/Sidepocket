-- Server-owned ratings only; new players join the ladder after their first rated game.
-- The filtered index excludes players who have not played and follows display order.
create index sideout_players_leaderboard on sideout.players(rating desc,wins desc,games asc,code asc)
where games > 0;

-- This narrowly granted gateway reads the private schema without exposing its tables.
-- No user ID, sorting expression, rating or result limit can be supplied by a client.
create function public.sideout_leaderboard() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_id uuid := sideout.me(); v_result jsonb;
begin
  perform sideout.ensure(v_id);
  with ranked as materialized (
    select p.user_id,p.rating,p.wins,p.games,p.code,
      pg_catalog.rank() over(order by p.rating desc) as position
    from sideout.players p join sideout.profiles f on f.user_id = p.user_id
    where p.games > 0 and f.data->'avatarCreated' = 'true'::jsonb
  ), leaders as (
    select r.* from ranked r order by r.rating desc,r.wins desc,r.games asc,r.code asc limit 100
  )
  select pg_catalog.jsonb_build_object(
    'entries',coalesce((select pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object('rank',l.position,'player',sideout.player_view(l.user_id))
      order by l.rating desc,l.wins desc,l.games asc,l.code asc) from leaders l),'[]'::jsonb),
    'me',pg_catalog.jsonb_build_object('rank',(select r.position from ranked r where r.user_id = v_id),'player',sideout.player_view(v_id)),
    'rankedPlayers',(select pg_catalog.count(*) from ranked),'limit',100)
  into v_result;
  return v_result;
end $$;

revoke all on function public.sideout_leaderboard() from public, anon, authenticated;
grant execute on function public.sideout_leaderboard() to authenticated;
