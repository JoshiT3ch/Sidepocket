# Supabase backend

Court owner applications, protected verified-player entitlements, reviewer roles, and hourly reservations use `20261022160605_sideout_owner_court_bookings.sql`. Apply it before the bookings interface. The private definer function performs authentication and ownership checks; `public.sideout_booking` is an invoker gateway. New tables have RLS and no browser table access. Run `supabase/tests/bookings.sql` as a rollback-only acceptance fixture. Reviewer designation and manual verification setup are described in `admin/court-operations.md`; subscription payments are not enabled.

The configured project remains **Sideout**, ref `pbfqudxyjklntneipjpq`. The canonical website is `https://sideout-valenciacity.vercel.app`, served by Vercel project `prj_wOFyOpHTDgn1VFBSIbeaqLWDqnFj` from the repository's `dist/` directory (Framework Preset **Other**, no install or build command, Output Directory `.`). The static browser client reads its public URL and publishable key from `dist/connection.js`; account and application data remain in the same Supabase project. This hosting change requires no database migration.

## Match room activation

Apply `migrations/20261024052500_sideout_match_rooms.sql` after the existing match-scoring and court-booking migrations, before publishing the room interface. The migration is prepared locally and has not been applied to the live project.

The authenticated `sideout_room(p_action text,p_data jsonb)` gateway supports get, create, slot, waiting, start, leave, and close. It stores one leader per room, four playing slots, and two to twelve waiting slots. Unique membership and slot keys plus room/player locks prevent double claims. Slot transfers are atomic. Only the leader can add slots, start, or close; active match participants cannot change slots. A leader in waiting can start the selected four players. Historical team references leave saved duo membership unchanged.

The new private tables have RLS enabled, with no browser table or helper grants. Closing a room releases everyone. Apply this migration before using the updated operator account-deletion helper. Run `tests/rooms.sql` and `tests/delete-player-acceptance.sql` as rollback fixtures with the existing scoring regressions. Local SQLite and browser tests also exercise room QR decoding, competing slot choices, waiting rotation, scoring, and unrated waiting players.

## Schema and API

The applied migration is `migrations/202610130001_sideout.sql` (migration name `sideout_accounts_and_doubles`). Do not run it again against the configured project. For a new, empty project, apply this migration once through the normal Supabase migration workflow before configuring the browser connection.

The private `sideout` schema contains profiles, players, duos, duo membership, invitations, and matches. Every table has RLS enabled, and browser roles have no direct schema or table grants. Private helper functions are not callable by browser roles. The public API consists of these explicitly granted, authenticated functions:

| Function | Purpose |
| --- | --- |
| `sideout_profile` | Read or initialize the current player's cosmetic profile |
| `sideout_save_profile` | Validate and save the current player's cosmetics |
| `sideout_play` | Read the current player's rating, duo, invitations, and matches |
| `sideout_room` | Read, join, move slots, and manage a shared match room |
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

### Linear rating award migration

`migrations/20261020041959_sideout_linear_rating_award.sql` prepares the new rule for a future release. It replaces only the existing private `sideout.award(numeric,numeric)` helper; the original migration remains unchanged. Both match previews and result submission already use this helper. No migration or fixture from this change has been applied to the live project.

The award is `clamp(round(30 + (opponent duo average - winner duo average) / 10), 20, 40)`. Each duo average uses both saved player ratings without rounding the average first. A 1200-MMR duo beating a 1300-MMR duo gains 40 per player; equal duos gain 30; a favorite ahead by at least 100 gains 20. Intermediate gaps scale by one point per 10 MMR. Round the complete positive total, with half points rounding upward, before bounding the award. Each losing player loses the same award, subject to the existing 100-MMR floor.

Apply this forward migration with the matching application release before using the new rule in production. Results recorded afterward use the new award; stored completed-match deltas, existing player ratings, public RPC grants, RLS, and match/player locking are unchanged. The migration contains no data rewrite.

### Match settings and set scores

`migrations/20261020052413_sideout_match_scoring.sql` adds nullable `format` and `scores` to private matches and their public match/history views. It was applied to Sideout on October 22, 2026 as remote migration `20261022142643_sideout_match_scoring`, fixing the missing `sideout_match_create(p_code,p_format)` gateway. The migration and scoring suite first passed in a rollback-only rehearsal against the live schema; the complete suite passed again after application, with all fixture accounts and games rolled back. The private rating award helper remains unchanged; the separate linear rating migration is still pending. Scoring works with either award formula, and its tests derive the expected award from the configured helper.

New formatted challenges use exactly `{"bestOf":3,"pointsToWin":11,"winBy":2}`-shaped JSON. `bestOf` accepts 1, 3, or 5; `pointsToWin` accepts 11, 15, or 21; `winBy` accepts 1 or 2. All three fields must be numeric integers, with no extra fields. The browser defaults to best of three, 11 points, win by two. The chosen format is fixed when the challenge is created and cannot be changed afterward.

| RPC signature and named arguments | Behavior |
| --- | --- |
| `sideout_match_create(p_code text)` | Retained legacy challenge with null format |
| `sideout_match_create(p_code text, p_format jsonb)` | Validate and save the chosen format |
| `sideout_match_result(p_id uuid, p_winner text)` | Retained winner-only reporting for legacy matches |
| `sideout_match_result(p_id uuid, p_scores jsonb, p_winner text default null)` | Derive the winner from the saved format and scores; an optional supplied winner must agree |

The required `p_scores` argument distinguishes scored reporting from the legacy overload. The browser service passes `p_format` only when settings are present and `p_scores` only when set scores are present. Explicit null settings are rejected; omitting settings preserves legacy behavior. A formatted match rejects the winner-only gateway, while a legacy match continues to require a winner and rejects score reporting.

Verified after deployment: both new gateway signatures exist; authenticated execution is granted, anonymous execution is denied, and no scoring fixture users remain. PostgREST's schema cache was refreshed. Advisor results retain the intentional private-schema/no-client-policy design and authenticated guarded SECURITY DEFINER gateways; see the existing RLS/gateway notice below. No unrelated migrations were applied.

Scores are an ordered array such as `[{"a":11,"b":8},{"a":9,"b":11},{"a":12,"b":10}]`, using the match's saved `a` and `b` rosters. Each set contains only numeric integer `a` and `b` scores from 0 to 99. No ties, incomplete sets, unplayed overshoots, or sets after either duo wins a majority are allowed. Win-by-one sets end at the target with the other duo below it. Win-by-two sets end at the target when the loser is at least two behind, or exactly two above the loser after deuce: 11–9 and 12–10 are valid for 11/by-two; 12–0, 12–9, and 20–5 are not.

Scored reporting keeps the existing authentication, participant authorization, deterministic player/match locks, and stale-rating checks. It applies the rating award once per whole match and atomically stores the derived winner, scores, four deltas, and completed history. Invalid scores, winner mismatches, stale snapshots, and repeated results change no player stats or saved results. Existing completed matches retain null format/scores and their stored deltas. New private validation and completion helpers remain inaccessible to browser roles; only the two new guarded overloads are granted to authenticated users.

## Production Google Auth setup

The hosted interface is Google-first: **Continue with Google** creates an account or signs in an existing player. Cloud email/password form submissions are rejected by the browser service; the optional local SQLite backend and its email/password forms remain available. This interface change does not disable Supabase email-confirmation protections.

The Supabase **Site URL** is configured as `https://sideout-valenciacity.vercel.app`. These origin-specific redirect allowlist entries were verified after saving, so player and duo-invite links can survive login on both hosted addresses:

- `https://sideout-valenciacity.vercel.app/**`
- `https://sideout-valencia.dchiligan.chatgpt.site/**`

Do not allow all `vercel.app` or `chatgpt.site` websites. The browser passes a same-origin callback URL with validated `player` or `duo` query parameters and no app hash; the Supabase SDK consumes its token fragment before app navigation. Ordinary sign-ins then open `/#profile`, valid player links open `/?player=SO-…#play`, and duo invites continue through avatar setup before joining. Keep development-only localhost redirects out of production settings unless actively needed. See [Supabase redirect URL matching rules](https://supabase.com/docs/guides/auth/redirect-urls).

A real Google sign-in from a player link on the Vercel website returned to the new origin's `#play` page and loaded the existing profile and duo. The player-link destination was preserved. Use the following Google provider settings and repeat the full production checklist after a hosting-origin change:

1. In Google Cloud, use a Google Auth Platform project with an **External** audience and publish it **In production** for the public launch.
2. Configure only the basic identity scopes: `openid`, `email` (`https://www.googleapis.com/auth/userinfo.email`), and `profile` (`https://www.googleapis.com/auth/userinfo.profile`). Do not add Gmail, Drive, or other sensitive/restricted scopes.
3. Use a **Web application** OAuth client with **Authorized JavaScript origin** `https://sideout-valenciacity.vercel.app`. Retain the previous origin `https://sideout-valencia.dchiligan.chatgpt.site` while that website remains available.
4. Set this exact **Authorized redirect URI**: `https://pbfqudxyjklntneipjpq.supabase.co/auth/v1/callback`. This is the Supabase callback, not a Sideout page.
5. Save the Google client ID and client secret in the project's **Authentication → Sign In / Providers → Google** settings and enable that provider. The secret belongs only in Supabase, never in `dist/`, browser code, this repository, or screenshots. Keep nonce checks and email-verification protections enabled.
6. From the production website, complete a sign-in with a Google account the tester controls. Verify the return to Sideout, mandatory avatar creation, profile save, logout, and subsequent login. Repeat from a valid player QR link to confirm its destination survives the OAuth round trip. Also verify cancellation returns a usable sign-in screen.

The existing database supports Google users without another SQL migration: profiles initialize from the authenticated user ID, use a safe display-name fallback when provider metadata is absent, and require avatar completion before play.

A purchased domain and custom SMTP are not prerequisites for this basic Google login. Google permits published external apps using only basic identity scopes without verified branding; the consent screen will show the shared Supabase auth domain (`pbfqudxyjklntneipjpq.supabase.co`) instead of verified Sideout branding. Custom domains and brand verification are recommended improvements. Do not claim ownership of the shared `supabase.co`, `vercel.app`, or `chatgpt.site` domains when configuring verification. Workspace administrators can still block apps for their users. See [Supabase Google setup](https://supabase.com/docs/guides/auth/social-login/auth-google), [Google OAuth app states](https://developers.google.com/identity/protocols/oauth2/production-readiness/overview), and [Google brand verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification).

## Optional email Auth later

Resend/custom SMTP can be added later if the cloud interface restores email/password signup, password recovery, or other transactional emails. Supabase's default sender only serves project-team addresses and is unsuitable for general public email signup. A sending provider needs an appropriate verified sender domain; that is separate from hosting Sideout at its existing free website address. Keep provider credentials in the Supabase dashboard or a protected server environment and verify a real confirmation email returns to the production website before enabling that flow. See [Supabase custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp). This release does not add a password-recovery screen.

## PostgreSQL acceptance fixture

`tests/sideout.sql` is a complete database-owner test transaction. It creates temporary fixture users, runs application calls under the client roles with fixture JWT claims, and finishes with `ROLLBACK`. Execute the **entire file** against the intended project through the Supabase SQL editor or the connected SQL execution tool. Do not execute only the fixture inserts or remove the rollback.

The fixture checks:

- Anonymous and missing-identity denial, private-table and helper access restrictions, and account isolation.
- Profile defaults, height/body/character validation, all wardrobe and hair/color choices, gender-specific hairstyles, and rejection of client-supplied real statistics.
- Stable player codes, duo invitations and acceptance, duo membership restrictions, challenges and acceptance, cancellation, and expiry.
- Four-player rating updates for a favorite win (+20), upset (+40), and equal duos (+30), the 100-point floor, and progression beyond 5000.
- Outsider denial, duplicate-result denial, and rollback when the accepted match snapshot is stale.

`tests/rating-rule.sql` separately checks the helper and duo-average previews at equal ratings, gaps of ±25/50/75/100, the 1200-versus-1300 example, fractional averages, half-point rounding, and extreme-rating caps. It also checks the private helper's privileges and function configuration. Execute this entire transaction, including its final `ROLLBACK`, after applying the new migration in an isolated database.

`tests/match-scoring.sql` checks all 18 supported formats, terminal scores and deuce, strict JSON input, incomplete and extra sets, authentication and participant permissions, both result overloads, immutable settings, mismatch and legacy-bypass rejection, one award per match, stale-snapshot rollback, duplicate submission, and saved history. Its fixture accounts, matches, and ratings are rolled back with the entire transaction.

The current migration set and all nine SQL acceptance fixtures passed in isolated PGlite 0.5.10 (PostgreSQL 18.6), with zero fixture accounts after rollback. The updated rating and scoring fixtures have not been run against the live project. The JavaScript suite (`npm test`) separately checks the local backend and Supabase service contract, including Google OAuth redirects and errors; it does not run these SQL fixtures or complete a real Google login.

## Leaderboard

Apply `migrations/20261014150708_sideout_leaderboard.sql` after the original Sideout migration. The authenticated `public.sideout_leaderboard()` RPC returns `{entries:[{rank,player}],me:{rank,player},rankedPlayers,limit:100}`. It computes rank over all eligible players before limiting the displayed rows and includes the caller's position separately. Only completed avatars with at least one authoritative rated game qualify. Ratings alone determine shared competition ranks; wins, games, and player code order tied rows consistently.

The RPC reuses the existing allowlisted player view and does not grant access to private tables or expose email addresses. `PUBLIC` and `anon` cannot execute it. The separate `tests/leaderboard.sql` fixture verifies eligibility, ties, the top-100 cutoff, the caller's position, and access restrictions inside a transaction that ends with `ROLLBACK`.

## Duo invite QR links

Apply `migrations/20261015045300_sideout_duo_links.sql`, then `migrations/20261015045954_sideout_duo_links_owner_index.sql`. The first adds the private `sideout.duo_links` table and the authenticated `public.sideout_duo_link_create()` and `public.sideout_duo_link_join(p_token text)` gateways. The second indexes the owner foreign key.

The owner explicitly creates a one-use UUID invite valid for 24 hours. Rotation replaces older unused links. Joining requires a completed avatar for both players, no existing duo, and no unfinished match. The transaction locks both players in the existing deterministic order, claims the link, creates membership, and cancels conflicting pending invitations. A retry returns only the same original active duo. A consumed link cannot recreate a dissolved duo, and ordinary duo creation revokes unused owner links.

The browser carries `?duo=UUID` through login, Google OAuth and avatar creation. Supabase must allow the callback with that query. Keep both `https://sideout-valenciacity.vercel.app/**` and `https://sideout-valencia.dchiligan.chatgpt.site/**` in the redirect allowlist. Saved QR links still open the origin encoded in the image, so keep the previous website accessible. Generate and share fresh player and duo-invite QRs from the Vercel website for future use. Existing Supabase accounts, avatars, ratings, and active duos are shared across both addresses; browser sessions are origin-specific.

`tests/duo-links.sql` was executed successfully against the project as a transaction ending in `ROLLBACK`; its fixture users were confirmed absent afterward. It checks anonymous and identity denial, private-table restrictions, incomplete avatars, self-joins, invalid/expired/replaced links, one-use claims, safe retries, conflicting duos, ordinary-invite invalidation, and transaction rollback. The JavaScript suite separately verifies API behavior, actual QR raster decoding, auth redirects, and automatic joining after avatar completion. A local browser test also completed a fresh signup and avatar from an invite and showed both players in the resulting duo.

Advisor review retains the existing RPC architecture: private tables intentionally have no client RLS policies or direct grants, and authenticated callers intentionally execute narrow `SECURITY DEFINER` gateways whose helpers check identity and ownership. See the [RLS notice](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) and [gateway notice](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable). The pre-existing [leaked-password protection notice](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) remains; this Google-only hosted login change does not alter password settings.

## Courts and temporary check-ins

Apply `migrations/20261015144341_sideout_courts_presence.sql` after the earlier migrations. It seeds the eight owner-supplied court listings in private `sideout.courts` and adds private `sideout.court_checkins`, keyed by player ID. The authenticated gateways are `sideout_courts(p_court_id text default null)`, `sideout_court_check_in(p_court_id text, p_status text, p_open_play jsonb)`, and `sideout_court_leave(p_court_id text default null)`.

The gateways derive identity from authentication, require a completed avatar for check-in, validate the court and status, and require an actual JSON boolean for open play. They serialize changes on the player's existing lock, store server-owned timestamps and a two-hour expiry, and expose only the existing public player projection. Reads do not renew check-ins. The roster is capped at 100, with the caller first; directory counts cover all unexpired entries. The private tables retain RLS with no client policies or grants; the narrow authenticated gateways intentionally use the existing guarded `SECURITY DEFINER` architecture.

`tests/courts.sql` passed on the configured project as a complete transaction ending in `ROLLBACK`; fixture users and presence were confirmed absent afterward. It checks authentication, unfinished avatars, strict inputs, two-player counts and privacy, same-court updates, atomic moves, expiry, self-only leave, grants, foreign keys, account deletion, and unchanged ratings. JavaScript tests cover local API behavior, the fixed Supabase transport, and browser polling/expiry/error behavior. Court locations and availability are self-reported, not GPS or reservations. No Maps API or paid integration is configured.

## Existing local data

The optional Node/SQLite backend remains available for local development. Its `.data/sideout.sqlite` is excluded from source and static hosting. This release does not transfer local accounts, password hashes, avatars, or ratings into Supabase. Players from the local prototype create new cloud accounts; retain the local database if its data is needed later.

## Friends

Apply `migrations/20261017152442_sideout_friends.sql` after the existing migrations and before releasing the Friends UI. It adds private `sideout.friendships`, whose request history retains abuse-prevention timestamps, plus these authenticated gateways:

| Function | Purpose |
| --- | --- |
| `sideout_friends()` | Read the caller's accepted friends and incoming/outgoing pending requests |
| `sideout_friend_request(text)` | Send by public player code, with duplicate-safe retries and request limits |
| `sideout_friend_respond(uuid,boolean)` | Recipient accepts or declines a pending request |
| `sideout_friend_cancel(uuid)` | Requester cancels a pending request |
| `sideout_friend_remove(uuid)` | Either participant removes an accepted friendship |

Every mutation derives identity from `auth.uid()`, checks participant ownership, and takes the existing ordered player locks. A partial unique index prevents multiple active requests/friendships for an unordered player pair. Private table/helper access is revoked; RLS remains enabled; PUBLIC/anon cannot execute the gateways. Snapshots reuse the public player projection and never expose sign-in email, tokens, or another account's friend graph.

New requests require completed avatars and are limited to 20/hour plus 20 outgoing pending. Declined, cancelled or removed pairs have a 24-hour cooldown in either direction. Requests never auto-accept a crossing request or change duos, matches, or MMR. Auth account deletion cascades friendship/request history; the operator deletion helper also reports their removal explicitly.

The Friends migration and `tests/friends.sql` passed in isolated embedded PostgreSQL together with the existing migration/suite set. The suite covers authorization, privacy, transitions, retries, rate/cooldown limits, uniqueness, account deletion cascade, and unchanged game data. Multi-session concurrency was reviewed through lock order and unique constraints but was not load-tested. Production application and live verification are pending owner approval; no live friend requests or fixture accounts were created.

### Optional status and court sharing

Apply `migrations/20261017153913_sideout_friend_presence.sql` after Friends. Private `sideout.friend_presence` stores one manual status/court selection and two separate opt-in flags per account; both flags default false. The new authenticated gateways are `sideout_presence_update(text,text,jsonb,jsonb)` and `sideout_presence_hide()`. JSON booleans are required. Sharing requires a completed avatar; hiding remains available to every signed-in account. Server-owned expiry is exactly two hours after an explicit sharing save, and reads never extend it.

`sideout_friends()` adds the caller's `me.presence` settings, the small court choice list, and `serverTime`. Only accepted friend entries gain a `presence` field. That field is null when hidden/expired; otherwise it contains only the selected visible status, court ID/name, and expiry. The private projection rechecks the accepted relationship. Pending requests cannot read presence, and no last-seen or update time is exposed to friends. Expired own settings normalize sharing flags to false while retaining the saved private selections.

Turning court sharing off atomically removes the caller's public court check-in. Hide turns both flags off, clears the court and expiry, and removes that public check-in under the same player lock used by court actions. Checking in again through Courts is an explicit public sharing action and remains visible to all signed-in players. Friends sharing has no GPS or automatic online tracking. Browser expiry removes cached shared details even if a refresh fails; a removed friendship loses access on subsequent API reads.

All seven migrations and seven SQL suites, including `tests/presence.sql` and the extended operator deletion fixture, passed locally in PGlite PostgreSQL 18.6. Presence tests cover strict validation, identity and grants, independent toggles, accepted-only reads, hidden/expired projections, exact expiry, public roster cleanup, ownership, no read renewal, removal and account-deletion cascades, and unchanged game data. Every fixture transaction rolled back and left no synthetic users. This is local verification; live migration, rollback rehearsal and production publication still require owner approval.

The JavaScript suite passes 214 tests. A two-account local browser check verified sharing Playing/Paddle Grove, seeing it from the accepted friend's account, hiding both details, and confirming removal of an existing public court check-in. Reload retained the hidden preferences. The 390px mobile view had no horizontal overflow and no console errors. Browser lifetime regressions cover offline restore clearing and reinitialization while an older import/request is pending.
