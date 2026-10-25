-- OPERATOR ONLY. This is deliberately not a migration or a public RPC.
-- Default: ROLLBACK. See admin/README.md before targeting a real account.
-- Verify the request and target UUID outside the transaction first.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- SIDEOUT_DELETE_HELPER_BEGIN
create or replace function pg_temp.sideout_delete_player(p_user_id uuid,p_confirmation text)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $delete$
declare
  v_duos uuid[];
  v_matches uuid[];
  v_counts jsonb := '{}'::jsonb;
  v_count bigint;
  v_scim boolean := false;
begin
  -- Invoker privileges remain in force. No client roles receive execution rights.
  if not exists(select 1 from pg_catalog.pg_roles r where r.rolname = current_user and (r.rolsuper or r.rolbypassrls)) then
    raise exception 'Run this procedure only through the project database operator.' using errcode = '42501';
  end if;
  if p_user_id is null or p_confirmation is distinct from 'DELETE ' || p_user_id::text then
    raise exception 'Supply the verified account UUID and exact DELETE UUID confirmation.' using errcode = '22023';
  end if;

  -- Rare operator action: briefly serialize writes while collecting dependencies.
  -- Reads remain possible. A busy database fails closed at the caller's timeout.
  lock table auth.users,auth.refresh_tokens,auth.flow_state,sideout.players,sideout.profiles,sideout.duos,
    sideout.duo_members,sideout.invitations,sideout.matches,sideout.duo_links,
    sideout.court_checkins,sideout.friendships,sideout.friend_presence,sideout.rooms,sideout.room_members,
    sideout.hosted_events,sideout.hosting_participants in share row exclusive mode;
  perform u.id from auth.users u where u.id = p_user_id for update;
  if not found then raise exception 'Account UUID not found; nothing was deleted.' using errcode = 'P0002'; end if;

  -- Sideout currently uses social sign-in. Do not silently detach a future
  -- enterprise-provisioned identity whose SCIM retention needs separate review.
  if pg_catalog.to_regclass('auth.scim_users') is not null then
    execute 'select exists(select 1 from auth.scim_users where user_id = $1)' into v_scim using p_user_id;
    if v_scim then raise exception 'SCIM-linked account requires an operator-reviewed deletion procedure; nothing was deleted.'; end if;
  end if;

  select coalesce(pg_catalog.array_agg(d.id),'{}'::uuid[]) into v_duos
  from sideout.duos d
  where d.player_a = p_user_id or d.player_b = p_user_id
    or exists(select 1 from sideout.duo_members m where m.user_id = p_user_id and m.duo_id = d.id);

  select coalesce(pg_catalog.array_agg(m.id),'{}'::uuid[]) into v_matches
  from sideout.matches m
  where m.player_a1 = p_user_id or m.player_a2 = p_user_id
    or m.player_b1 = p_user_id or m.player_b2 = p_user_id
    or m.created_by = p_user_id or m.reported_by = p_user_id
    or m.duo_a = any(v_duos) or m.duo_b = any(v_duos)
    -- Historical snapshots also contain identifiers, names, and chosen avatar
    -- details. Include legacy snapshots even if their live FK slots differ.
    or m.teams @> pg_catalog.jsonb_build_object('a',pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('id',p_user_id)))
    or m.teams @> pg_catalog.jsonb_build_object('b',pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('id',p_user_id)))
    or m.deltas @> pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('playerId',p_user_id));

  delete from sideout.duo_links l
  where l.owner_id = p_user_id or l.claimed_by = p_user_id or l.duo_id = any(v_duos);
  get diagnostics v_count = row_count;
  v_counts := v_counts || pg_catalog.jsonb_build_object('duoLinks',v_count);
  delete from sideout.hosting_participants where user_id=p_user_id;
  get diagnostics v_count = row_count;
  v_counts := v_counts || pg_catalog.jsonb_build_object('hostingMemberships',v_count);
  delete from sideout.hosted_events where host_id=p_user_id;
  get diagnostics v_count = row_count;
  v_counts := v_counts || pg_catalog.jsonb_build_object('hostedEvents',v_count);
  delete from sideout.friendships f where f.requester_id = p_user_id or f.recipient_id = p_user_id;
  get diagnostics v_count = row_count;
  v_counts := v_counts || pg_catalog.jsonb_build_object('friendships',v_count);
  delete from sideout.invitations i where i.from_id = p_user_id or i.to_id = p_user_id;
  get diagnostics v_count = row_count;
  v_counts := v_counts || pg_catalog.jsonb_build_object('invitations',v_count);
  delete from sideout.matches m where m.id = any(v_matches);
  get diagnostics v_count = row_count;
  v_counts := v_counts || pg_catalog.jsonb_build_object('matches',v_count);
  delete from sideout.room_members where user_id=p_user_id;
  get diagnostics v_count = row_count;
  v_counts := v_counts || pg_catalog.jsonb_build_object('roomMemberships',v_count);
  delete from sideout.rooms where leader_id=p_user_id;
  get diagnostics v_count = row_count;
  v_counts := v_counts || pg_catalog.jsonb_build_object('rooms',v_count);
  delete from sideout.duo_members m where m.user_id = p_user_id or m.duo_id = any(v_duos);
  get diagnostics v_count = row_count;
  v_counts := v_counts || pg_catalog.jsonb_build_object('duoMembers',v_count);
  delete from sideout.duos d where d.id = any(v_duos);
  get diagnostics v_count = row_count;
  v_counts := v_counts || pg_catalog.jsonb_build_object('duos',v_count);
  delete from sideout.court_checkins c where c.user_id = p_user_id;
  get diagnostics v_count = row_count;
  v_counts := v_counts || pg_catalog.jsonb_build_object('courtCheckins',v_count);
  delete from sideout.friend_presence p where p.user_id = p_user_id;
  get diagnostics v_count = row_count;
  v_counts := v_counts || pg_catalog.jsonb_build_object('friendPresence',v_count);
  delete from sideout.profiles p where p.user_id = p_user_id;
  get diagnostics v_count = row_count;
  v_counts := v_counts || pg_catalog.jsonb_build_object('profiles',v_count);
  delete from sideout.players p where p.user_id = p_user_id;
  get diagnostics v_count = row_count;
  v_counts := v_counts || pg_catalog.jsonb_build_object('players',v_count);

  -- refresh_tokens.user_id is text and has no user FK in the inspected project.
  -- Explicit cleanup also removes older refresh tokens without a session_id.
  delete from auth.refresh_tokens t where t.user_id = p_user_id::text;
  get diagnostics v_count = row_count;
  v_counts := v_counts || pg_catalog.jsonb_build_object('refreshTokens',v_count);
  -- OAuth flow state has nullable UUIDs without a user FK in this project.
  -- A pending link to the target is also part of the target's account cleanup.
  delete from auth.flow_state f where f.user_id = p_user_id or f.linking_target_id = p_user_id;
  get diagnostics v_count = row_count;
  v_counts := v_counts || pg_catalog.jsonb_build_object('authFlows',v_count);
  -- Managed ON DELETE CASCADE removes identities, sessions and their children,
  -- factors, one-time tokens, OAuth grants, recovery codes and WebAuthn records.
  delete from auth.users u where u.id = p_user_id;
  get diagnostics v_count = row_count;
  if v_count <> 1 then raise exception 'Account removal did not affect exactly one user; roll back.'; end if;
  v_counts := v_counts || pg_catalog.jsonb_build_object('authUsers',v_count);

  if exists(select 1 from auth.users u where u.id = p_user_id)
    or exists(select 1 from auth.identities i where i.user_id = p_user_id)
    or exists(select 1 from auth.sessions s where s.user_id = p_user_id)
    or exists(select 1 from auth.refresh_tokens t where t.user_id = p_user_id::text)
    or exists(select 1 from auth.flow_state f where f.user_id = p_user_id or f.linking_target_id = p_user_id)
    or exists(select 1 from sideout.friendships f where f.requester_id = p_user_id or f.recipient_id = p_user_id)
    or exists(select 1 from sideout.friend_presence p where p.user_id = p_user_id)
    or exists(select 1 from sideout.hosted_events e where e.host_id = p_user_id)
    or exists(select 1 from sideout.hosting_participants p where p.user_id = p_user_id)
    or exists(select 1 from sideout.players p where p.user_id = p_user_id)
    or exists(select 1 from sideout.profiles p where p.user_id = p_user_id) then
    raise exception 'Live account cleanup incomplete; roll back.';
  end if;
  return pg_catalog.jsonb_build_object('targetUserId',p_user_id,'deleted',v_counts,
    'otherPlayerAggregatesChanged',false,'sharedMatchHistoryRemoved',pg_catalog.cardinality(v_matches));
end
$delete$;
revoke all on function pg_temp.sideout_delete_player(uuid,text) from public,anon,authenticated;
-- SIDEOUT_DELETE_HELPER_END

-- Intentionally disabled. Replace BOTH placeholders with the same verified UUID.
-- select pg_temp.sideout_delete_player(
--   'VERIFIED-ACCOUNT-UUID'::uuid,
--   'DELETE VERIFIED-ACCOUNT-UUID'
-- );

-- Keep ROLLBACK for rehearsal. Only an authorized, reviewed real deletion should
-- replace this final statement with COMMIT. Never commit the acceptance fixture.
rollback;
