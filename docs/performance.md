# Sideout performance refactor

The website and installed web app use the same code, so these improvements apply to both.

## Changes

- Core player modules load in parallel. Story editing and duo/matchup effects load only when used.
- Pure player/duo URL helpers live in `dist/player-links.js`; generating a QR uses `dist/qr.js`, and camera/photo decoding loads `dist/qr-decoder.js` on demand. The 267,136-byte decoder vendor module is no longer part of the normal player-page module graph.
- Rendering is keyed to the values a section actually displays. Hidden avatar/locker controls wait until their page opens. Existing control and thumbnail nodes are reused, and height preview updates share an animation frame.
- Story preview thumbnails are reused. Switching templates redraws the selected card without regenerating all three thumbnails; unchanged stats do not re-encode its PNG.
- Profile edits coalesce over 250 ms and writes remain serialized. Save my look flushes immediately; logout waits for pending saves. Backgrounding also starts a best-effort flush. Errors remain visible and a failed latest save prevents logout until retried.
- Player startup makes one data request. Navigation reuses a snapshot for up to 20 seconds; explicit Refresh always requests current data. Unchanged polls preserve the existing UI, and opponent lookups no longer delay the caller's stats display.
- Polling pauses on unrelated pages and hidden tabs, and resumes after browser back/forward restoration. Scanner imports and camera streams are cleaned up when navigation changes during startup.
- Fonts are discovered directly in the HTML head, with preconnects, instead of through a CSS import.

The service worker still caches only the public offline screen and its assets. Account, OAuth, Supabase and match data are not added to a cache.

## Evidence

Measured against production baseline `62dbe77` using the same controller/DOM harness:

| Operation | Before | After |
| --- | ---: | ---: |
| Startup avatar drawing calls, including initial stats | 6 | 1 |
| Startup hair thumbnail drawing calls | 24 | 0 |
| Startup clothing thumbnail drawing calls | 20 | 0 |
| Subsequent stats update avatar/thumbnail drawing calls | 25 | 0 |
| Story template switch full card drawing calls | 4 | 1 |
| Player startup requests including immediate navigation | 2 | 1 |

An isolated browser comparison of the signed-in profile created 32 canvas elements before and 7 after; wardrobe items and hairstyle buttons are now created on the first locker visit. A burst of 20 profile edits produces one latest-state write in the save-controller regression test.

These measurements count work eliminated, not device timing or a Lighthouse score. Network latency and phone hardware still affect perceived speed. Browser checks covered profile/locker navigation, saving cosmetics, story template selection and a real 1080 × 1920 PNG download. The automated suite also covers QR decoding, pairing, session behavior, save failures, scanner cleanup and offline behavior.

Run `npm test` from the project root for all regression checks. The suite includes `tests/app-performance.test.mjs`, `tests/profile-saver.test.mjs` and the expanded `tests/play-ui.test.mjs`.
