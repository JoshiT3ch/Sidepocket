# Supabase backend

The configured project is **Sideout**, ref `pbfqudxyjklntneipjpq`. The static browser client reads its public URL and publishable key from `dist/connection.js`; account and application data remain in Supabase.

## Schema and API

The applied migration is `migrations/202610130001_sideout.sql` (migration name `sideout_accounts_and_doubles`). Do not run it again against the configured project. For a new, empty project, apply this migration once through the normal Supabase migration workflow before configuring the browser connection.

The private `sideout` schema contains profiles, players, duos, duo membership, invitations, and matches. Every table has RLS enabled, and browser roles have no direct schema or table grants. Private helper functions are not callable by browser roles. The public API consists of these explicitly granted, authenticated functions:

| Function | Purpose |
| --- | --- |
| `sideout_profile` | Read or initialize the current player's cosmetic profile |
| `sideout_save_profile` | Validate and save the current player's cosmetics |
| `sideout_play` | Read the current player's rating, duo, invitations, and matches |
| `sideout_player` | Look up a player by their public QR code |
| `sideout_duo_invite` | Invite another player as a teammate |
| `sideout_duo_respond` | Accept or decline a received invitation |
| `sideout_duo_leave` | Leave an eligible duo |
| `sideout_match_create` | Challenge another duo |
| `sideout_match_respond` | Accept or decline a received challenge |
| `sideout_match_result` | Record one result and update all four players atomically |
| `sideout_match_cancel` | Cancel an unplayed game |

These functions use `SECURITY DEFINER` with an empty search path, qualified schema references, signed-in user checks, and action-specific authorization. `PUBLIC` and `anon` execution is revoked. Authentication alone does not grant access to another player's private data or permit reporting an unrelated game. This intentionally exposes a guarded function API rather than the underlying tables.

Profiles and ladder records initialize on authenticated use. Avatar completion is required for play. Cosmetic profile fields cannot assign real ratings. Result submission locks the match and players, validates the accepted team snapshot, computes the 20–40-point award from the two duo averages, and commits the result once. An error rolls back every player's update.

## Production Auth setup

The database and browser connection are implemented and tested. These deployment settings still need to be completed and verified before public email signup is ready:

1. In **Authentication → URL Configuration**, set **Site URL** to the actual published HTTPS website origin.
2. Add the website's confirmation destinations to **Redirect URLs**. The client returns ordinary signups to `/#profile` and player links to `/?player=SO-…#play`. Preserve other required redirects and use rules restricted to the published website. Keep localhost redirects only while they are needed for development.
3. Keep email/password signup enabled and configure email confirmation for the intended launch policy. The interface supports the pending-confirmation state.
4. Configure **custom SMTP** with the selected sender and provider credentials in the Supabase dashboard. Supabase's default sender only sends to project-team addresses and is unsuitable for general public signup. See [custom SMTP documentation](https://supabase.com/docs/guides/auth/auth-smtp).
5. Verify a signup with a real address the tester controls: receive the confirmation, return to the published website, create an avatar, log out, and log back in. For a QR signup link, also verify that the selected player is retained after confirmation.

See [Supabase redirect URL documentation](https://supabase.com/docs/guides/auth/redirect-urls) for matching rules. SMTP credentials and privileged Supabase keys belong only in the appropriate dashboard or protected server environment, never in this repository or the static build. This release does not add a password-recovery screen.

## PostgreSQL acceptance fixture

`tests/sideout.sql` is a complete database-owner test transaction. It creates temporary fixture users, runs application calls under the client roles with fixture JWT claims, and finishes with `ROLLBACK`. Execute the **entire file** against the intended project through the Supabase SQL editor or the connected SQL execution tool. Do not execute only the fixture inserts or remove the rollback.

The fixture checks:

- Anonymous and missing-identity denial, private-table and helper access restrictions, and account isolation.
- Profile defaults, height/body/character validation, all wardrobe and hair/color choices, gender-specific hairstyles, and rejection of client-supplied real statistics.
- Stable player codes, duo invitations and acceptance, duo membership restrictions, challenges and acceptance, cancellation, and expiry.
- Four-player rating updates for a favorite win (+22), upset (+38), and equal duos (+30), the 100-point floor, and progression beyond 5000.
- Outsider denial, duplicate-result denial, and rollback when the accepted match snapshot is stale.

The fixture passed against the configured project. No test users or games were retained. The JavaScript suite (`npm test`) separately passed 54 tests, including 12 Supabase service-contract tests; it does not itself run this live SQL fixture.

## Existing local data

The optional Node/SQLite backend remains available for local development. Its `.data/sideout.sqlite` is excluded from source and static hosting. This release does not transfer local accounts, password hashes, avatars, or ratings into Supabase. Players from the local prototype create new cloud accounts; retain the local database if its data is needed later.