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
| `sideout_leaderboard` | Read the top 100 rated players and the current player's position |
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

## Production Google Auth setup

The hosted interface is Google-first: **Continue with Google** creates an account or signs in an existing player. Cloud email/password form submissions are rejected by the browser service; the optional local SQLite backend and its email/password forms remain available. This interface change does not disable Supabase email-confirmation protections.

The Supabase **Site URL** is already configured as `https://sideout-valencia.dchiligan.chatgpt.site`. Its redirect allowlist is restricted to that website, including player-link queries and callback fragments. Ordinary sign-ins return to `/#profile`; valid player links return to `/?player=SO-…#play`. Keep any development-only localhost redirects out of production settings unless they are actively needed. See [Supabase redirect URL matching rules](https://supabase.com/docs/guides/auth/redirect-urls).

Google OAuth project/provider configuration is in progress. A successful live Google → Supabase → Sideout login has not yet been verified. Finish and check these settings before announcing Google login as ready:

1. In Google Cloud, use a Google Auth Platform project with an **External** audience and publish it **In production** for the public launch.
2. Configure only the basic identity scopes: `openid`, `email` (`https://www.googleapis.com/auth/userinfo.email`), and `profile` (`https://www.googleapis.com/auth/userinfo.profile`). Do not add Gmail, Drive, or other sensitive/restricted scopes.
3. Create a **Web application** OAuth client with this exact **Authorized JavaScript origin**: `https://sideout-valencia.dchiligan.chatgpt.site`.
4. Set this exact **Authorized redirect URI**: `https://pbfqudxyjklntneipjpq.supabase.co/auth/v1/callback`. This is the Supabase callback, not a Sideout page.
5. Save the Google client ID and client secret in the project's **Authentication → Sign In / Providers → Google** settings and enable that provider. The secret belongs only in Supabase, never in `dist/`, browser code, this repository, or screenshots. Keep nonce checks and email-verification protections enabled.
6. From the production website, complete a sign-in with a Google account the tester controls. Verify the return to Sideout, mandatory avatar creation, profile save, logout, and subsequent login. Repeat from a valid player QR link to confirm its destination survives the OAuth round trip. Also verify cancellation returns a usable sign-in screen.

The existing database supports Google users without another SQL migration: profiles initialize from the authenticated user ID, use a safe display-name fallback when provider metadata is absent, and require avatar completion before play.

A purchased domain and custom SMTP are not prerequisites for this basic Google login. Google permits published external apps using only basic identity scopes without verified branding; the consent screen will show the shared Supabase auth domain (`pbfqudxyjklntneipjpq.supabase.co`) instead of verified Sideout branding. Custom domains and brand verification are recommended improvements. Do not claim ownership of the shared `supabase.co` or `chatgpt.site` domains when configuring verification. Workspace administrators can still block apps for their users. See [Supabase Google setup](https://supabase.com/docs/guides/auth/social-login/auth-google), [Google OAuth app states](https://developers.google.com/identity/protocols/oauth2/production-readiness/overview), and [Google brand verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification).

## Optional email Auth later

Resend/custom SMTP can be added later if the cloud interface restores email/password signup, password recovery, or other transactional emails. Supabase's default sender only serves project-team addresses and is unsuitable for general public email signup. A sending provider needs an appropriate verified sender domain; that is separate from hosting Sideout at its existing free website address. Keep provider credentials in the Supabase dashboard or a protected server environment and verify a real confirmation email returns to the production website before enabling that flow. See [Supabase custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp). This release does not add a password-recovery screen.

## PostgreSQL acceptance fixture

`tests/sideout.sql` is a complete database-owner test transaction. It creates temporary fixture users, runs application calls under the client roles with fixture JWT claims, and finishes with `ROLLBACK`. Execute the **entire file** against the intended project through the Supabase SQL editor or the connected SQL execution tool. Do not execute only the fixture inserts or remove the rollback.

The fixture checks:

- Anonymous and missing-identity denial, private-table and helper access restrictions, and account isolation.
- Profile defaults, height/body/character validation, all wardrobe and hair/color choices, gender-specific hairstyles, and rejection of client-supplied real statistics.
- Stable player codes, duo invitations and acceptance, duo membership restrictions, challenges and acceptance, cancellation, and expiry.
- Four-player rating updates for a favorite win (+22), upset (+38), and equal duos (+30), the 100-point floor, and progression beyond 5000.
- Outsider denial, duplicate-result denial, and rollback when the accepted match snapshot is stale.

The fixture passed against the configured project. No test users or games were retained. The JavaScript suite (`npm test`) separately checks the local backend and Supabase service contract, including Google OAuth redirects and errors; it does not run this live SQL fixture or complete a real Google login.

## Leaderboard

Apply `migrations/20261014150708_sideout_leaderboard.sql` after the original Sideout migration. The authenticated `public.sideout_leaderboard()` RPC returns `{entries:[{rank,player}],me:{rank,player},rankedPlayers,limit:100}`. It computes rank over all eligible players before limiting the displayed rows and includes the caller's position separately. Only completed avatars with at least one authoritative rated game qualify. Ratings alone determine shared competition ranks; wins, games, and player code order tied rows consistently.

The RPC reuses the existing allowlisted player view and does not grant access to private tables or expose email addresses. `PUBLIC` and `anon` cannot execute it. The separate `tests/leaderboard.sql` fixture verifies eligibility, ties, the top-100 cutoff, the caller's position, and access restrictions inside a transaction that ends with `ROLLBACK`.

## Existing local data

The optional Node/SQLite backend remains available for local development. Its `.data/sideout.sqlite` is excluded from source and static hosting. This release does not transfer local accounts, password hashes, avatars, or ratings into Supabase. Players from the local prototype create new cloud accounts; retain the local database if its data is needed later.
