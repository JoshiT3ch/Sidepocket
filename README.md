# Sidepocket / Sideout

A pickleball website prototype with accounts, custom pixel avatars, player QR codes, doubles matches, and saved ratings.

## Run locally

Use Node.js 24 or newer. From the website folder, run:

```powershell
npm start
```

Open http://127.0.0.1:3000. Leave the terminal running; Ctrl+C stops the server. No dependency installation is needed. Opening HTML directly or using a separate static preview server does not provide the account or match APIs.

## Accounts and characters

Sign up, then create an avatar with a character type, height, and body type. Male and female hairstyles have separate choices; both support six hair colors. The locker includes 40 clothing pieces across caps, shirts, shorts, and pants, with Nike and Adidas choices. Avatars and outfits are saved per account and appear on the profile and downloadable story card.

## QR codes and doubles

Open **Play & QR** to show your stable player QR and code. Scan another player's QR with the camera, choose a QR photo, or paste a player code or link. Images are decoded locally in the browser.

Choose **Invite as my duo** to send a teammate invitation. Once they accept, both players form a duo. Each player can belong to one active duo.

Scan a player from another duo and choose **Challenge their duo**. A player on that duo accepts the challenge. Any of the four participants can then select the winning duo and record the result. One submission updates all four ratings immediately; there is no additional result confirmation. The match records who submitted it, the winner, and each player's before/after rating. Completed results cannot be submitted again. Unplayed games can be cancelled without changing ratings.

Pending duo invitations and challenges expire after 24 hours. An active game must be finished or cancelled before its players can start another game or change duos.

All players must connect to the same server and database. The default localhost address works only on the computer running the server. Phone-to-phone play needs a shared website address; live camera scanning needs HTTPS or a trusted local context. Photo scanning and code entry provide camera-free alternatives. Publishing requires a persistent database and appropriate PUBLIC_ORIGIN and COOKIE_SECURE configuration.

## Ratings

Rated doubles MMR starts at **1200** and uses the average rating of each duo. A win awards **20–40 points to each teammate**:

- Evenly rated duos: **+30** each.
- A 1600-average duo beats a 1200-average duo: **+22** each.
- A 1200-average duo beats a 1600-average duo: **+38** each.
- Very large rating differences approach **+20** for the favorite and **+40** for the underdog.

The losing duo loses the winner's award, down to a minimum player rating of 100. Winning ratings have no 5000-point ceiling. Profile statistics, rated match history, and story cards use this server-owned rating. Avatar changes and client profile edits cannot change it. Older demo statistics remain stored separately and are not imported into rated MMR.

## Storage and tests

Accounts, sessions, profiles, player codes, duos, and matches are stored in .data/sideout.sqlite; this folder is excluded from Git and static access. Passwords use salted scrypt hashes. Sessions use random tokens in HttpOnly, SameSite cookies, with hashed tokens stored in the database. Mutation requests require the expected origin and application header. Email verification and password reset are not included.

Run:

```powershell
npm test
```

Tests cover authentication, avatar validation and migration, account isolation, genuine QR pixel decoding, doubles pairing, result authorization, all four rating updates, duplicate submissions, expiry, cancellation, and transaction rollback.

QR libraries are vendored for offline use. Their pinned source versions and licenses are documented in dist/vendor/README.md.