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

Open **Play & QR** to show your stable player QR and code. Scan another player's QR with the camera, choose a QR photo, or paste a player code or link. Images are decoded locally in the browser.

Choose **Invite as my duo** to send a teammate invitation. Once they accept, both players form a duo. Each player can belong to one active duo.

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

## Validation

Run the JavaScript tests with:

```powershell
npm test
```

The JavaScript suite covers the local backend and the Supabase service contract: authentication, Google OAuth redirects and errors, the cloud email/password guard, avatar validation, account isolation, genuine QR pixel decoding, pairing, result authorization, all four rating updates, duplicate submissions, expiry, cancellation, and transaction rollback. Passing these tests does not verify the live Google OAuth project or a successful production callback; that requires the manual check in `supabase/README.md`.

`supabase/tests/sideout.sql` is the separate PostgreSQL acceptance fixture. It was executed successfully against the Sideout project as a transaction that ends in `ROLLBACK`; no fixture users or games remain. See `supabase/README.md` for its scope and how to run it.

QR library licenses and pinned sources are documented in `dist/vendor/README.md`.
