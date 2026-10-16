# Operator-only player deletion

`delete-player.sql` is an explicit manual procedure for a verified account deletion request. It creates a `pg_temp` **SECURITY INVOKER** helper only in the operator's SQL session. It is not a migration, persistent function, browser endpoint, or client RPC. It grants no client access and rolls back by default.

## Scope and consequences

The procedure removes the selected account's live Supabase Auth user, identities and sessions through managed Auth cascades, and explicitly removes refresh tokens including legacy tokens without a session, plus pending Auth flow states for that user or links targeting that user. It removes the player's profile/avatar, player code and aggregate stats, current court check-in, invitations, duo links, memberships, and both current and historical duos involving that player. It deletes affected match records entirely, including JSON player/character/rating snapshots and rating-delta references.

**Shared match history is removed for the other participants too. Their existing aggregate MMR, games, and wins remain unchanged.** Other accounts, profile/avatar data, unrelated duos/links/invitations, check-ins, and unrelated matches are preserved. Do not describe deletion as recalculating everyone else's ratings or retaining an anonymized match archive.

The account's old JWT may remain cryptographically valid until its normal expiry. Sideout's gateways still deny it because `sideout.me()` requires its subject to exist in `auth.users`; it cannot lazily recreate the profile. New deliberate sign-up later is a separate account creation and is not prevented by this procedure.

This handles live account/application records only. It does not promise to purge provider backups, platform/security/audit logs, exported data, operator communications, or copies of shared story cards. No public deletion deadline or backup retention policy is established by this file. A target with a SCIM mapping is rejected for additional operator review instead of silently detaching enterprise records. Future schema changes require another dependency review and fixture run.

## Rehearse the rollback-only fixture

Run after all existing Sideout migrations, with a project database operator session. The fixture uses only new random synthetic users with `example.invalid` emails, checks target and preserved control rows, then rolls back. Never change its final rollback to commit.

The SQL tool must receive the helper and fixture **in one request**, since temporary functions are session-scoped. This PowerShell recipe assembles them without changing the originals (run from the repository root):

```powershell
$helperText = Get-Content -Raw -LiteralPath 'supabase/admin/delete-player.sql'
$helperBlock = [regex]::Match($helperText, '(?s)-- SIDEOUT_DELETE_HELPER_BEGIN\r?\n(.*?)-- SIDEOUT_DELETE_HELPER_END').Groups[1].Value
if ([string]::IsNullOrWhiteSpace($helperBlock)) { throw 'Deletion helper markers missing.' }
$fixtureText = Get-Content -Raw -LiteralPath 'supabase/tests/delete-player-acceptance.sql'
$assembledSql = $fixtureText.Replace('-- SIDEOUT_DELETE_HELPER_INSERT', $helperBlock)
# Send $assembledSql as the SQL tool's query argument in a single request.
# If saving a local copy for review, use an operator-private path outside dist/.
```

The fixture seeds a nondefault female avatar and stats, both target duo positions and all four match participant slots, creator/reporter references, JSON-only historical references, invitations, claimed/unclaimed duo links, court presence, Auth identity/session, both forms of refresh token, and Auth flow state through both account references. It verifies exact preservation of other fixture accounts, their profiles and aggregate stats, their Auth sessions/tokens and an unrelated flow, an unrelated completed game, and other unrelated records. It also rejects wrong confirmations/client roles and demonstrates stale JWT denial after deletion.

Passing JavaScript tests does not execute this SQL fixture. Record the actual SQL fixture outcome before calling the manual procedure verified. No production user should be used as a test target.

## Fulfill an approved real request

1. Verify the requester and the intended account outside SQL. Do not rely on an editable display name alone. Resolve its immutable `auth.users.id` using the authenticated account and operator tools. Do not ask for passwords, login codes, provider tokens, or identity-document photos.
2. Review the shared-history consequence and live-data limits above. Keep any request tracking separate from public code and avoid unnecessary personal information in SQL output or screenshots.
3. Recheck the schema and run the rollback fixture after relevant changes. Open a new operator SQL query using the full `delete-player.sql` file.
4. Uncomment its one sample call and replace **both** placeholders with the same verified UUID. Keep its final `ROLLBACK` for an initial rehearsal. Review the returned counts and target UUID; no real removal survives this rehearsal.
5. Only after the verified request authorizes actual deletion, rerun the reviewed script with its final `ROLLBACK` changed to `COMMIT`. Run the complete script in one SQL request. Do not execute a real target call before finishing identity verification; a commit is destructive.
6. If there is a timeout, unexpected foreign-key dependency, SCIM warning, or failed assertion, leave the transaction rolled back and investigate. Do not disable constraints or broaden deletion to unrelated accounts.
7. Verify in a fresh operator query that the target is absent from live Auth and Sideout records, and confirm the actual outcome to the requester. Explain any separately retained provider backups/logs or externally shared copies accurately instead of claiming they were erased.

The helper uses a 5-second lock timeout and a 30-second statement timeout in its wrapper. It briefly blocks writes to the participating application tables while collecting and removing references; normal reads remain possible. Keep the transaction short and avoid external work while it holds locks.
