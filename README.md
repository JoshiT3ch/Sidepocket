# Sideout

A pickleball website for the Valencia City, Bukidnon community: accounts, custom pixel avatars, player QR codes, doubles matches, and saved ratings. The GitHub repository is named Sidepocket.

## Website and Supabase

The canonical public website is [Sideout](https://sideout-valenciacity.vercel.app). It is a static build in `dist/`, hosted by Vercel. Its default connection in `dist/connection.js` still uses the existing **Sideout** Supabase project (`pbfqudxyjklntneipjpq`) at `https://pbfqudxyjklntneipjpq.supabase.co`. The cloud interface uses **Continue with Google** for account creation and sign-in; PostgreSQL handles profiles, player codes, duos, matches, and ratings. A Node server is not required by the hosted website.

The source repository is `JoshiT3ch/Sidepocket`. Vercel project `prj_wOFyOpHTDgn1VFBSIbeaqLWDqnFj` uses these static deployment settings:

| Setting | Value |
| --- | --- |
| Root Directory | `dist` |
| Framework Preset | Other |
| Install Command | None |
| Build Command | None |
| Output Directory | `.` |

Keep the [previous website address](https://sideout-valencia.dchiligan.chatgpt.site) accessible for saved player and duo-invite QR links. New QRs opened or created on the Vercel website use its new origin; share fresh QRs from that address going forward. Both websites use the same Supabase accounts and game data, but browser sign-in sessions are separate for each origin, so players may need to sign in again on Vercel.

The browser uses a publishable key. This key is intentionally public; service-role keys, secret keys, database passwords, and SMTP credentials must never be placed in `dist/` or committed. The pinned Supabase browser SDK is served locally from `dist/vendor/`; its version, checksum, and license are recorded in `dist/vendor/SUPABASE-PROVENANCE.md`.

Google login does not require a purchased website domain or signup confirmation emails. The production Supabase Site URL is configured for Vercel, with redirects retained for the previous address while its QR links remain in use. A real Google sign-in from a player QR link was verified on the Vercel website, including loading the existing profile and duo. See `supabase/README.md` for the exact settings and production login checklist. Resend/custom SMTP is optional future work if email/password signup is restored. Password recovery is not implemented in this interface.

## Install Sideout on your phone

Open https://sideout-valenciacity.vercel.app and tap **Install Sideout** above the sign-in screen or clubhouse. In Chrome on Android, use the install prompt when available, or the browser menu's **Add to Home screen → Install**. On iPhone, open the website in Safari, tap **Share → Add to Home Screen**, enable **Open as Web App** when shown, and tap **Add**. Chrome and Edge on desktop can also install Sideout from their address bar or browser menu.

The installable web app uses the existing Google accounts, avatars, duos, matches, and ratings. Installation is free. It opens in its own window with the Sideout home-screen icon. Some platforms keep browser and installed-app sign-in storage separate, so a player may need to sign in again after installation. The browser controls whether and when a native installation prompt appears; iPhone uses the Share menu instructions instead.

Internet is required to sign in, load and save profiles, check in to courts, and record games. The service worker caches only a public offline screen, its styling/script, and its icon. It never caches account pages, OAuth callbacks, Supabase responses, or match results. A failed navigation displays that offline screen at the original URL, preserving a player or duo link for retry. New service worker versions take over after old app windows close, avoiding a forced reload during play. Increment the cache name in `dist/sw.js` when changing the offline screen assets.

This installation retains browser-based image sharing. Direct Instagram Story integration requires a separate native implementation.

## Preview locally

Use Node.js 24 or newer. From the website folder, run:

```powershell
npm start
```

Open `http://127.0.0.1:3000`. Leave the terminal running; Ctrl+C stops the server. No dependency installation is needed. With the default connection, this preview uses the same Supabase project as the hosted website. Another static HTTP server can also serve `dist/`; opening the HTML with a `file:` URL is unsupported.

For the optional, separate SQLite development backend, replace the contents of `dist/connection.js` with:

```js
export default {provider: 'local'};
```

Then use `npm start`. Local mode requires this Node server for its account and match APIs. Restore the Supabase configuration before publishing. Existing `.data/sideout.sqlite` files are preserved, excluded from Git and static access, and **are not imported into Supabase**. Local accounts, passwords, ratings, and cloud accounts are separate; previous local players need to create a cloud account.

## Accounts and characters

On the hosted website, **Continue with Google** creates an account on the first successful sign-in and opens the existing account on later visits. Both routes use the same button. The cloud interface does not expose email/password signup or login. First-time players must create an avatar with character type, height, and body type before playing.

The optional local SQLite mode retains its separate email/password forms and backend. Switching the cloud interface to Google does not migrate local accounts, change stored local passwords, or disable Supabase email-confirmation protections.

Male and female hairstyles have separate choices; both support six hair colors. The locker includes 40 clothing pieces across caps, shirts, shorts, and pants, with Nike and Adidas choices. Avatars and outfits are saved per account and appear on the profile and downloadable story card.

## Court owners and bookings

Open **Courts** to try **Court 1**, a free test listing, reserve one-hour slots in Philippine time, and manage bookings. Court owners apply with details, hours, rate, ownership information, and an optional photo. Only verified players can submit; a separate Sideout reviewer approves courts before booking opens. Planned verified membership is **PHP 100/month** with a profile checkmark. Subscription payments are not enabled. No real reviewer or membership is automatically assigned. See `docs/courts-plan.md` and `supabase/admin/court-operations.md` for details and operator setup.

## Friends

Open **Friends** to add someone by their Sideout player code or player link. You can also find a player in **Play & QR** and choose **Add friend**. Only the invited player can accept or decline; the sender can cancel a pending request. Accepted friends appear on both accounts with their saved avatar, public player code, and current MMR. Either player can remove the friendship after an inline confirmation.

Friendships are separate from duos, matches, and ratings. Adding a friend never forms a duo or starts a game. Each account reads only its own friends and incoming/outgoing requests; sign-in emails and private account information are not included. Friends refreshes every 20 seconds while visible, with a manual Refresh action.

In **Friends**, optionally share a status (**Available**, **Playing**, **Practicing**, or **Away**) and a manually selected court. Status and court sharing have separate controls and both start off. Only accepted friends receive the enabled details. Sharing expires two hours after an explicit save; reading or polling never renews it. Hidden and expired details include no last-seen timestamp. No GPS location is requested or tracked.

Turning court sharing off also removes your existing public court check-in. **Hide status & whereabouts** turns off both sharing choices, clears the selected court, and removes the public check-in in the same transaction. Checking in again under **Courts** explicitly shares your court with all signed-in players, even if Friends sharing remains off. Removing a friend revokes future reads of your shared status/court. Details already received by another device cannot be recalled.

The backend allows up to 20 new requests per hour and 20 outstanding outgoing requests. Repeated sends of the same pending request or existing friendship do not create duplicates. Crossing requests require an explicit incoming acceptance. After a decline, cancellation, or removal, both players wait 24 hours before starting another request for that pair. Historical request records support these limits; account deletion removes relationships and request history involving that account.

Cloud activation requires `supabase/migrations/20261017152442_sideout_friends.sql` followed by `supabase/migrations/20261017153913_sideout_friend_presence.sql` before deploying this Friends interface. The local Node preview supports the same actions using its isolated SQLite accounts. Database and browser validations are described in `supabase/README.md`.

## QR codes and doubles

Open **Play & QR** to show your stable player code and a QR that contains a full Sideout website URL. A normal phone camera can open it directly. Older saved QR images encoded custom player text; reopen the updated website and use its new QR. In Sideout, you can scan with the camera, choose a QR photo, or paste a player code or link. Images are decoded locally in the browser.

For automatic pairing, tap **Create duo invite QR** while you are free to form a duo. Share that QR or use **Copy QR link**. Your teammate opens the link, signs in (or creates an account with Google), finishes avatar setup if needed, and joins your duo automatically. This invite is a one-use, unpredictable link valid for 24 hours. Creating a new invite replaces the previous one. Keep it for your intended teammate. Self-joins, expired links, and players already in a different duo or unfinished match are rejected. Retrying the same successful claim is safe while that same duo is still active.

The invite stays in the current URL through login and Google OAuth; it is removed after a successful join. It is not stored across unrelated accounts. If joining fails, the link stays available for an explicit retry with **Refresh**. **Show player QR** returns to the normal profile lookup QR for opponents.

When a new duo forms, a green full-screen celebration shows both saved pixel characters side by side with **Duo with [teammate name]**. It pops into view and disappears automatically after three seconds. It also appears when a traditional invite is accepted or a refresh detects a newly formed duo, and does not replay for an existing duo on initial load or repeated refreshes. Reduced-motion preferences keep the same three-second display without the movement.

Finding a player from another complete duo by QR, photo, player code, or player link opens a red **2v2** matchup preview. It shows all four saved characters, player names, individual MMR, and both team averages for three seconds. Explicitly scanning again replays the preview; background refreshes do not. Choose **Challenge their duo** afterward to send the match invitation. Looking up yourself, your teammate, or an unpaired player does not show the opponent preview. Reduced-motion preferences disable the entrance animation.

The normal player QR lets people find your profile without pairing automatically. Choose **Invite as my duo** to send a traditional teammate invitation. Incoming invitations automatically appear in a centered popup on any clubhouse page, showing the inviter’s saved character, name, MMR, and **Accept duo** / **Decline** buttons. Open invitations also appear when signing in; while the app is visible it checks for new ones every 20 seconds. Closing the popup leaves the invitation pending without repeatedly interrupting you; reopen it under **Play & QR → My duo**. A new invitation opens the popup again. Invitations wait until the QR scanner or another dialog closes, and response errors stay visible in the popup so you can retry. Each player can belong to one active duo. Duo invite QRs are the separate path that already has the creator's consent to pair.

Scan a player from another duo and choose **Challenge their duo** to open **Match settings**. Choose **1 set**, **best of 3**, or **best of 5**, a target of **11**, **15**, or **21 points per set**, and **win by 1** or **win by 2**. The default is best of 3 to 11, win by 2. These rules are saved with the challenge and stay fixed once it is sent.

Both players on the challenged duo automatically receive a centered popup on any clubhouse page, with the chosen format, all four saved characters, player names, individual MMR, team averages, and **Accept match** / **Decline** buttons. A player on that duo accepts the challenge; the sender and their teammate see its waiting status without a response popup. Closing the popup leaves the challenge pending without repeatedly reopening it; choose **View challenge** under **Play & QR → Doubles matches** to decide later. New challenges open the popup again, while accepted, declined, cancelled, and expired challenges disappear on refresh. Invitations and challenges share one popup and wait for another open dialog to close.

After playing, enter each completed set's score under **Doubles matches**, leaving unplayed sets blank. The winning duo is calculated from the scores: two set wins finish best of 3, and three finish best of 5. Win-by-2 games can extend past their target (for example, 12–10 is valid in a game to 11). Win-by-1 games end exactly at their target. Tied, unfinished, impossible, and extra sets are rejected by both the interface and the server. Draft scores survive connection refreshes and failed submissions during the current visit. Saved set scores appear in the match card and each player's rated history.

Any of the four participants can record the completed match. One submission updates all four ratings **once for the whole match**, regardless of the number of sets; there is no additional result confirmation or score-based rating formula in this change. The match records who submitted it, the settings, scores, winner, and each player's before/after rating. Completed results cannot be submitted again. Unplayed games can be cancelled without changing ratings. Earlier matches and older clients with no saved format retain their original winner-only flow; a match with settings requires valid set scores and cannot use that legacy result shortcut. Cloud support requires the forward match-scoring migration described in `supabase/README.md` before publishing this interface.

Pending duo invitations and challenges expire after 24 hours. An active game must be finished or cancelled before its players can start another game or change duos. Players must use the same Supabase project and a shared website address. Live camera scanning requires HTTPS or a trusted local context; photo scanning and code entry are alternatives.

## Ratings and data ownership

Rated doubles MMR starts at **1200** and uses the average rating of each duo. A win awards **20–40 points to each teammate**:

- Evenly rated duos: **+30** each.
- A 1200-average duo beats a 1250-average duo: **+35** each.
- A 1200-average duo beats a 1300-average duo: **+40** each.
- A 1300-average duo beats a 1200-average duo: **+20** each.

The award is `round(30 + (opponent average − winning duo average) / 10)`, capped between **20** and **40**. A 100 MMR gap reaches either cap; larger gaps stay at the cap. Calculate both duo averages at full precision before rounding the final award to the nearest whole point (half points round up). Match previews and result submissions use the same rule. Previously recorded ratings and match deltas stay unchanged.

The losing duo loses the winner's award, down to a minimum player rating of 100. Winning ratings have no 5000-point ceiling. PostgreSQL calculates and commits all four changes in one transaction. Profile statistics, rated match history, and story cards use this database-owned rating. Cosmetic profile updates cannot edit MMR, wins, or played-game counts. Older demo statistics remain separate and are not imported into rated MMR.

Application tables live in the private `sideout` schema. Browser roles have no direct table access. The client calls a fixed list of authenticated PostgreSQL functions, each of which checks the signed-in player and the action's ownership or participation requirements. Accepted teams are retained in match snapshots, and a recorded result cannot be replayed.

## Story card templates

Open **My player → Make my story card** and choose **Rally Shot**, **Court Pose**, or **Player Card**. Rally Shot captures a paddle swing with a ball trail on a pixel court. Court Pose puts the character on the court for a player portrait. Player Card keeps the simple clubhouse poster.

Each template uses the player's current character, hair, equipped clothing, and authoritative doubles rating. Preview the selected design, then tap **Share story card** to pass its 1080 × 1920 PNG to your device's share menu. Choose Instagram/Stories when offered. The website cannot select an app or confirm publication; Instagram account connection is not required. **Save PNG** remains available for manual upload to Instagram or Facebook Stories. Choosing a template changes the card artwork only and does not change the saved avatar or rating.

Sharing requires a browser that supports image files through the Web Share API over HTTPS (or a trusted local context). The card is prepared before the Share tap to preserve the browser's user gesture requirement. Unsupported browsers and sharing failures show manual steps, while cancellation leaves the preview intact. A resolved share request means a handoff to the device, not a posted Instagram Story.

## Leaderboard

Open **Leaderboard** to see the top 100 players in the Valencia community, ranked by their database-owned doubles MMR. Players qualify after completing their avatar and at least one rated game. New players remain unranked until that first result.

Equal ratings share a competition rank (for example, 1, 1, 3). Wins, then fewer games, then player code provide a stable display order within a tie without changing the shared rank. Each row shows the player's pixel avatar, MMR, wins, games, and win rate. Your own position is available even when your row is outside the top 100. Reopen the page or use **Refresh** to load the latest results.

The board is available to signed-in players. It shares the existing game display name and avatar, never email addresses or account credentials. It uses genuine rated results; profile demo statistics cannot affect placement.

## Courts and open play

Open **Courts** to choose one of the eight community-maintained Valencia listings and see its active player check-ins, pixel avatars, MMR, and open-play availability. The directory includes Paddle Grove, Jerpits Pickleball Hub, Hive Pickleball Court, ACP Pickleball, Pickle Point Arena Bukidnon, Spinners Pickle Yard, VALENCIA GOODWILL GIANTS SPORTS TOWN, and The Bodega. Names and addresses were supplied by the Sideout owner; directions are Google Maps search links and require no Maps API.

Signed-in players with completed avatars can tap **I'm here**, choose **Playing**, **Idle**, or **Practicing**, and optionally select **Available for open play**. This voluntarily shares the selected court and status with signed-in players. Each account has one check-in; choosing another court moves it atomically. **Leave court** removes only the caller's presence. This is a self-reported check-in, not GPS tracking or a court reservation.

Check-ins expire two hours after the last explicit check-in or status update. Reading or polling never renews them. The page refreshes every 10 seconds while visible, and removes known expired entries locally if the network fails. Rosters show up to 100 active players, with the caller first; directory counts include all active check-ins. Errors preserve the saved check-in and show a retry action. The data uses the same Supabase project across devices, and court actions cannot edit ratings.

## Validation

Run the JavaScript tests with:

```powershell
npm test
```

The JavaScript suite covers the local backend and the Supabase service contract: authentication, Google OAuth redirects and errors, the cloud email/password guard, avatar validation, account isolation, genuine QR pixel decoding, pairing, result authorization, all four rating updates, duplicate submissions, expiry, cancellation, and transaction rollback. Passing these tests does not verify the live Google OAuth project or a successful production callback; that requires the manual check in `supabase/README.md`.

`supabase/tests/sideout.sql` is the separate PostgreSQL acceptance fixture. It was executed successfully against the Sideout project as a transaction that ends in `ROLLBACK`; no fixture users or games remain. See `supabase/README.md` for its scope and how to run it.

QR library licenses and pinned sources are documented in `dist/vendor/README.md`.
