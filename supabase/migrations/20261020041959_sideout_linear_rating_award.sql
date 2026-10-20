-- Apply the linear award to future results without rewriting stored ratings or deltas.
-- Both preview() and sideout_match_result() already use this private helper.
create or replace function sideout.award(p_winner numeric,p_opponent numeric)
returns integer language sql immutable set search_path = '' as $$
  -- Round the positive base-plus-adjustment total so half points round upward.
  -- Clamp as numeric before converting to integer, including extreme ratings.
  select greatest(20::numeric,least(40::numeric,
    pg_catalog.round(30::numeric + (p_opponent-p_winner)/10::numeric)))::integer
$$;
