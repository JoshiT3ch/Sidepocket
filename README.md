# Sideout

A pickleball website for the Valencia City, Bukidnon community: accounts, custom pixel avatars, player QR codes, doubles matches, and saved ratings. The GitHub repository is named Sidepocket.

## Website and Supabase

The public website is [Sideout](https://sideout-valencia.dchiligan.chatgpt.site). It is a static build in `dist/`. Its default connection in `dist/connection.js` uses the **Sideout** Supabase project (`pbfqudxyjklntneipjpq`) at `https://pbfqudxyjklntneipjpq.supabase.co`. The cloud interface uses **Continue with Google** for account creation and sign-in; PostgreSQL handles profiles, player codes, duos, matches, and ratings. A Node server is not required by the hosted website.

The browser uses a publishable key. This key is intentionally public; service-role keys, secret keys, database passwords, and SMTP credentials must never be placed in `dist/` or committed. The pinned Supabase browser SDK is served locally from `dist/vendor/`; its version, checksum, and license are recorded in `dist/vendor/SUPABASE-PROVENANCE.md`.

Google login does not require a purchased website domain or signup confirmation emails. The production Supabase Site URL and redirect allowlist are already configured for the free website address. Google OAuth project/provider configuration and an end-to-end production login still need verification; see `supabase/README.md` for the exact settings. Resend/custom SMTP is optional future work if email/password signup is restored. Password recovery is not implemented in this interface.

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

## QR codes and doubles

Open **Play & QR** to show your stable player code and a QR that contains a full Sideout website URL. A normal phone camera can open it directly. Older saved QR images encoded custom player text; reopen the updated website and use its new QR. In Sideout, you can scan with the camera, choose a QR photo, or paste a player code or link. Images are decoded locally in the browser.

For automatic pairing, tap **Create duo invite QR** while you are free to form a duo. Share that QR or use **Copy QR link**. Your teammate opens the link, signs in (or creates an account with Google), finishes avatar setup if needed, and joins your duo automatically. This invite is a one-use, unpredictable link valid for 24 hours. Creating a new invite replaces the previous one. Keep it for your intended teammate. Self-joins, expired links, and players already in a different duo or unfinished match are rejected. Retrying the same successful claim is safe while that same duo is still active.

The invite stays in the current URL through login and Google OAuth; it is removed after a successful join. It is not stored across unrelated accounts. If joining fails, the link stays available for an explicit retry with **Refresh**. **Show player QR** returns to the normal profile lookup QR for opponents.

When a new duo forms, a green full-screen celebration shows both saved pixel characters side by side with **Duo with [teammate name]**. It pops into view and disappears automatically after three seconds. It also appears when a traditional invite is accepted or a refresh detects a newly formed duo, and does not replay for an existing duo on initial load or repeated refreshes. Reduced-motion preferences keep the same three-second display without the movement.

Finding a player from another complete duo by QR, photo, player code, or player link opens a red **2v2** matchup preview. It shows all four saved characters, player names, individual MMR, and both team averages for three seconds. Explicitly scanning again replays the preview; background refreshes do not. Choose **Challenge their duo** afterward to send the match invitation. Looking up yourself, your teammate, or an unpaired player does not show the opponent preview. Reduced-motion preferences disable the entrance animation.

The normal player QR lets people find your profile without pairing automatically. Choose **Invite as my duo** to send a traditional teammate invitation; the other player accepts it in Sideout. Each player can belong to one active duo. Duo invite QRs are the separate path that already has the creator's consent to pair.

Scan a player from another duo and choose **Challenge their duo**. A player on that duo accepts the challenge. Any of the four participants can then select the winning duo and record the result. One submission updates all four ratings immediately; there is no additional result confirmation. The match records who submitted it, the winner, and each player's before/after rating. Completed results cannot be submitted again. Unplayed games can be cancelled without changing ratings.

Pending duo invitations and challenges expire after 24 hours. An active game must be finished or cancelled before its players can start another game or change duos. Players must use the same Supabase project and a shared website address. Live camera scanning requires HTTPS or a trusted local context; photo scanning and code entry are alternatives.

## Ratings and data ownership

Rated doubles MMR starts at **1200** and uses the average rating of each duo. A win awards **20–40 points to each teammate**:

- Evenly rated duos: **+30** each.
- A 1600-average duo beats a 1200-average duo: **+22** each.
- A 1200-average duo beats a 1600-average duo: **+38** each.
- Very large rating differences approach **+20** for the favorite and **+40** for the underdog.

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

## Validation

Run the JavaScript tests with:

```powershell
npm test
```

The JavaScript suite covers the local backend and the Supabase service contract: authentication, Google OAuth redirects and errors, the cloud email/password guard, avatar validation, account isolation, genuine QR pixel decoding, pairing, result authorization, all four rating updates, duplicate submissions, expiry, cancellation, and transaction rollback. Passing these tests does not verify the live Google OAuth project or a successful production callback; that requires the manual check in `supabase/README.md`.

`supabase/tests/sideout.sql` is the separate PostgreSQL acceptance fixture. It was executed successfully against the Sideout project as a transaction that ends in `ROLLBACK`; no fixture users or games remain. See `supabase/README.md` for its scope and how to run it.

QR library licenses and pinned sources are documented in `dist/vendor/README.md`.
