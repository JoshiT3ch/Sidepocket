# Sidepocket

A static pickleball website prototype with a customizable 2D pixel player, demo rating, and downloadable story card.

## Open locally

Install Node.js 24 or newer, then run these commands from the website folder:

```powershell
npm start
```

Open http://127.0.0.1:3000. Leave the terminal running; Ctrl+C stops the server. No npm dependency installation is needed.

Opening `dist/index.html` directly shows the account screen with instructions to start the server. Login and sign-up require the server.

## Wardrobe

The locker includes 40 original pixel clothing designs: 10 caps, 10 shirts, 10 shorts, and 10 pants. Each category includes five Nike and five Adidas styles, with brand filtering, item previews, and live try-on. Caps include panel, mesh, visor, and reverse styles; shirts include tees, polos, tanks, zip tops, and jerseys; bottoms include shorts, joggers, track pants, and cargo pants. Equipping pants replaces shorts and vice versa. Outfits are appearance options and do not change MMR.

Characters use a detailed shared pixel renderer with shaded skin, hair, jersey seams, patterned clothing, socks, shoes, and a textured paddle. The same outfit appears on the profile and story card. Existing players retain their custom jersey colors.

## Accounts

Sign up with a player name, email, and a password of at least 8 characters. Registration signs you in. Existing players can log in; the header has a logout button. Each account has a separate saved character and demo rating. After signing in, players without a completed avatar must create one before entering the clubhouse. Choose a male or female character, a height (120–220 cm), body type (Lean, Regular, Broad), skin tone, and jersey color with a live pixel preview. These appearance choices do not change MMR. Character style, height, and body type can be edited later in The locker. Both character styles support 10 hairstyles (Short crop, Buzz cut, Side part, Spiky, Curly, Afro, Bob, Long waves, Ponytail, Top bun) and six hair colors. Choose hair during avatar setup or in The locker, with thumbnail previews and a cap toggle. Hair is saved per account and appears on the player profile and story card. Existing male avatars default to Short crop and existing female avatars to Ponytail. Both characters support every height, body type, skin tone, jersey, paddle, and headwear option. Character style is an avatar preference and does not alter ratings. Existing accounts are prompted once; their previous colors and demo history are preserved.

The local server stores account records and profiles in `.data/sideout.sqlite`, which is excluded from Git. Passwords use salted scrypt hashes. Sessions use random tokens in HttpOnly, SameSite cookies; tokens are hashed in the database and expire after seven days. Logout revokes the current session. Authentication attempts are rate-limited and modifying API requests are checked for the expected origin and application header.

Email ownership verification and password reset are not included yet. Keep the server local during this prototype phase. Public hosting requires HTTPS, persistent database storage, and an explicit `PUBLIC_ORIGIN` and `COOKIE_SECURE=true`. The default server binds to `127.0.0.1`.

## Tests

```powershell
npm test
```

The integration test uses a temporary database, checks registration/login/logout, profile isolation and persistence, invalid inputs, session expiry, cross-site request rejection, password hashing, rate limiting, and private file access.

## Files

- `dist/index.html`: website screens
- `dist/styles.css`: responsive styles
- `dist/app.js`: customization, demo ratings, profile saving, and PNG export
- `dist/auth.js`: login and sign-up forms, session checks, and logout
- `server.mjs`: account API, SQLite persistence, and website server

Ratings and match results remain demonstrations. Account records and player profiles are saved by the local server. The hosting metadata from the static prototype must be updated before deploying this server-backed version to a hosting service.
