-- A separate, short-lived capability records the owner's explicit consent to pair.
-- A public player code never grants permission to automatically form a duo.
create table sideout.duo_links (
  token uuid primary key default pg_catalog.gen_random_uuid(),
  owner_id uuid not null references sideout.players(user_id),
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  expires_at timestamptz not null default (pg_catalog.clock_timestamp() + interval '24 hours'),
  revoked_at timestamptz,
  claimed_by uuid references sideout.players(user_id),
  duo_id uuid references sideout.duos(id),
  check (expires_at > created_at),
  check ((claimed_by is null) = (duo_id is null)),
  check (claimed_by is null or claimed_by <> owner_id)
);
create index sideout_duo_links_available on sideout.duo_links(owner_id)
where claimed_by is null and revoked_at is null;
create index sideout_duo_links_claimant on sideout.duo_links(claimed_by);
create index sideout_duo_links_duo on sideout.duo_links(duo_id);
alter table sideout.duo_links enable row level security;
revoke all on table sideout.duo_links from public, anon, authenticated;

-- All duo-formation paths revoke unused links, including ordinary invitations.
-- Existing callers already hold the ordered player locks before inserting members.
create function sideout.revoke_member_duo_links() returns trigger
language plpgsql set search_path = '' as $$
begin
  update sideout.duo_links set revoked_at = pg_catalog.clock_timestamp()
  where owner_id = new.user_id and claimed_by is null and revoked_at is null;
  return new;
end $$;
create trigger sideout_revoke_member_duo_links after insert on sideout.duo_members
for each row execute function sideout.revoke_member_duo_links();

create function sideout.duo_link_create() returns jsonb
language plpgsql set search_path = '' as $$
declare v_id uuid := sideout.me(); v_link sideout.duo_links;
begin
  perform sideout.ready(v_id);
  perform sideout.lock_players(array[v_id]);
  perform sideout.ready(v_id);
  if sideout.duo_for(v_id) is not null then raise exception 'Leave your current duo before creating a duo link.'; end if;
  perform sideout.free(array[v_id]);
  update sideout.duo_links set revoked_at = pg_catalog.clock_timestamp()
  where owner_id = v_id and claimed_by is null and revoked_at is null;
  insert into sideout.duo_links(owner_id) values(v_id) returning * into v_link;
  return pg_catalog.jsonb_build_object('token',v_link.token,'expiresAt',sideout.millis(v_link.expires_at));
end $$;

create function sideout.duo_link_join(p_token text) returns jsonb
language plpgsql set search_path = '' as $$
declare v_id uuid := sideout.me(); v_link sideout.duo_links; v_duo uuid;
begin
  perform sideout.ready(v_id);
  if p_token is null or p_token !~* '^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' then
    raise exception 'This duo link is invalid. Ask your partner for a new one.';
  end if;
  select l.* into v_link from sideout.duo_links l where l.token = p_token::uuid;
  if not found then raise exception 'This duo link is invalid. Ask your partner for a new one.' using errcode = 'P0002'; end if;
  if v_link.owner_id = v_id then raise exception 'This is your own duo link. Share it with your partner.'; end if;
  -- Never lock a link before its players: rotation, cross-scans and all existing
  -- duo/match/profile writes use the same ordered player-lock discipline.
  perform sideout.lock_players(array[v_id,v_link.owner_id]);
  select l.* into v_link from sideout.duo_links l where l.token = p_token::uuid for update;
  if v_link.revoked_at is not null or v_link.expires_at <= pg_catalog.clock_timestamp() then
    raise exception 'This duo link has expired or been replaced. Ask your partner for a new one.';
  end if;
  perform sideout.ready(v_id); perform sideout.ready(v_link.owner_id);
  if v_link.claimed_by is not null then
    -- A network retry may return the original active duo. Leaving it permanently
    -- ends this capability; it must never recreate that duo or pair a third player.
    if v_link.claimed_by = v_id and sideout.duo_for(v_id) = v_link.duo_id and
      sideout.duo_for(v_link.owner_id) = v_link.duo_id and
      exists(select 1 from sideout.duos d where d.id = v_link.duo_id and d.dissolved_at is null) then
      return sideout.play_view(v_id);
    end if;
    raise exception 'This duo link has already been used. Ask your partner for a new one.';
  end if;
  if sideout.duo_for(v_id) is not null or sideout.duo_for(v_link.owner_id) is not null then
    raise exception 'A player is already in a duo. Leave the current duo before choosing a new partner.';
  end if;
  perform sideout.free(array[v_id,v_link.owner_id]);
  insert into sideout.duos(player_a,player_b) values(v_link.owner_id,v_id) returning id into v_duo;
  update sideout.duo_links set claimed_by = v_id,duo_id = v_duo where token = v_link.token;
  insert into sideout.duo_members(user_id,duo_id) values(v_link.owner_id,v_duo),(v_id,v_duo);
  update sideout.invitations set status = 'cancelled' where status = 'pending' and
    (from_id in(v_id,v_link.owner_id) or to_id in(v_id,v_link.owner_id));
  return sideout.play_view(v_id);
end $$;

-- Thin gateways are the only exposed surface; private tables/helpers have no grants.
create function public.sideout_duo_link_create() returns jsonb
language sql security definer set search_path = '' as $$ select sideout.duo_link_create() $$;
create function public.sideout_duo_link_join(p_token text) returns jsonb
language sql security definer set search_path = '' as $$ select sideout.duo_link_join(p_token) $$;

revoke all on function sideout.revoke_member_duo_links(),sideout.duo_link_create(),sideout.duo_link_join(text) from public, anon, authenticated;
revoke all on function public.sideout_duo_link_create(),public.sideout_duo_link_join(text) from public, anon, authenticated;
grant execute on function public.sideout_duo_link_create(),public.sideout_duo_link_join(text) to authenticated;
