# Sideout Android prototype

This adds a Capacitor Android build around the existing Sideout interface. It uses the same hosted accounts and game data. The website is still served from `../dist`; native assets are assembled separately in `mobile/www`.

The current court directory/check-in page and Courts navigation entry have been removed at the owner's request. The future direction is court-owner applications, court images, and bookings; see [the Courts plan](../docs/courts-plan.md). Those replacement features are not implemented yet.

## Current status

The source includes Android build configuration, a packaged asset build, system-browser Google OAuth with PKCE, cold/warm callback handling, validated player/duo intent, public QR URLs, Android camera permission configuration, Back-button handling, and mobile spacing.

The owner built and installed the initial debug APK on October 22, 2026 and reported that it runs on their Android phone. The Android project, dependencies, and lockfile now exist locally. The updated scan-to-settings behavior below has passed automated tests; rebuilding the APK for that change must currently be done in a normal terminal because this agent session cannot write to the default Gradle cache or connect to a Gradle daemon. Commit the generated `package-lock.json` and Android project after reviewing them. Subsequent installs should use `npm ci`.

Matchmaking now uses a shared room QR. Players select an open **+** in either team or the waiting area and can transfer to another open slot before playing. The single leader adds waiting slots and starts the selected four players with the chosen settings. Room links survive Google sign-in and avatar setup. Apply the room migration before distributing this interface. Rebuild and install the Android APK to update an already installed app; copying website assets does not update that APK.

Finding an available player by camera, QR photo, player link, or typed code opens a global **Player found** popup with their avatar, name, MMR, player code, games and wins. **Invite as my duo** is enabled only when neither player already has a duo. Sending the invite requires a tap; failed requests stay visible in the popup and can be retried. Closing the popup does not reopen it during polling, and **View [player name]** reopens it explicitly. A code lookup for an opposing duo shows details after the 2v2 preview, with a challenge action; the existing automatic match-settings flow for scanned opposing duos remains available. Back closes the popup, and navigating away prevents delayed lookups from reopening it.

The missing live match-settings/scoring migration was applied and verified on October 22, 2026. The previously observed `sideout_match_create(p_code,p_format)` schema-cache error should no longer occur in the installed APK; no reinstall is needed for the database fix itself. The scan-to-settings UI change does require rebuilding and updating the installed APK.

The latest development package is available at `artifacts/Sideout-courts-removed.apk`, retaining the player-details and match-settings popups while removing the old court directory. Because the native code did not change and this session blocks Gradle's cache/daemon access, this package retains the original APK's manifest, DEX, and native resources and replaces only the packaged web assets. It was aligned with Android SDK `zipalign` and signed with the same existing debug certificate using `apksigner`. Signature verification, alignment verification, byte-for-byte verification of every packaged web asset, and comparison of unchanged native entries passed. It can be installed as an update over the earlier debug apps. The updated behavior still needs verification on the owner's phone.

Validation for this update: 138 targeted JavaScript tests passed, including player details from scans and code searches, explicit duo invitations, invitation error recovery, popup dismissal, scan/preview/settings timing, cancellation on navigation or opponent replacement, explicit challenge confirmation, mobile login, and QR parsing. The complete SQL scoring suite passed against the live schema in rollback-only transactions both before and after deployment; no fixture users remain.

This prototype reuses the existing live-camera QR scanner and local image decoder inside Capacitor's WebView. Capacitor handles the Android camera permission request; the manifest declares camera permission without requiring camera hardware. The existing photo/code alternatives remain available. Native scanning and permission behavior still need device verification.

## First build on this Windows computer

Node 24, Java 21, Android Studio, SDK 36, and Android platform tools were found on this computer. Run these commands in a terminal with access to npm and the Android/Gradle repositories:

```powershell
Set-Location 'C:\Users\hoyjo\OneDrive\Documents\ChatGPT\Sideout\website\mobile'
npm install
npm run android:init
npm run android:debug
```

Stop if any command fails and address that error before continuing. First setup generates `android/`; do not rerun `android:init` once that directory exists. For subsequent builds:

```powershell
npm run android:debug
```

If Gradle cannot find the SDK, set `ANDROID_HOME` to your SDK path or open the generated project with `npm run android:open` and let Android Studio configure `android/local.properties`. This machine's SDK is currently `C:\Users\hoyjo\AppData\Local\Android\Sdk` and its configured Java home is `C:\Program Files\Java\jdk-21.0.10`.

The debug script copies the resulting APK to `mobile/artifacts/Sideout-debug.apk`. This is a development build; it is not a signed Play Store release bundle. Keep signing keys outside source control.

## Enable the mobile login callback

In the existing Sideout Supabase project (`pbfqudxyjklntneipjpq`), open **Authentication > URL Configuration > Redirect URLs** and add this exact additional URL:

```text
com.sideout.valencia://auth/callback
```

Keep the existing website Site URL and redirect entries. This change is additive. The connected Supabase tools available in this session do not expose auth configuration updates, so this dashboard setting has not been applied.

The Google OAuth client continues to redirect to Supabase's hosted `/auth/v1/callback`, as it already does for the website. Do not replace that Google redirect with the app's custom scheme. Supabase performs the final redirect back to the app.

The app starts Google OAuth in an Android Custom Tab through the Browser plugin, then exchanges the returned code against its locally stored PKCE verifier. It does not accept access-token fragments, navigate to arbitrary scanned URLs, or embed a Google sign-in page inside the WebView. Temporary player/duo intent is cleared on success, error, logout, or expiry. A retry replaces the previous pending attempt. Session storage currently uses the Supabase SDK's persisted WebView storage; Android app backup is disabled by the generated configuration script.

## Install and verify

Enable Developer options and USB debugging on an Android phone and connect it. Check that the phone is listed and authorized:

```powershell
& "$env:ANDROID_HOME\platform-tools\adb.exe" devices
& "$env:ANDROID_HOME\platform-tools\adb.exe" install -r '.\artifacts\Sideout-debug.apk'
```

Open **Sideout** on the phone and verify:

1. Google opens outside the app's embedded view, and successful login returns to Sideout. Cancel and retry; close and reopen the app during login; sign out and back in.
2. Existing players retain their profile and ratings. New players complete avatar setup.
3. Grant camera permission and scan a real player QR. Deny permission and verify the QR-photo/player-code alternatives still work. Leave the scanner and verify the camera stops.
4. Generated player and duo QRs encode `https://sideout-valenciacity.vercel.app`, never `https://localhost`.
5. Form a duo, challenge another duo, and save a score using consenting test players. These actions use the live backend and change real game records.
6. Back closes the active dialog, returns from an app page to My player, then minimizes the app. Background and resume the app; check keyboard and screen spacing.
7. Disconnect the phone's internet; verify the offline message and that failed saves do not appear successful.

Automated callback and transport tests use doubles, not live Google accounts. Passing them does not establish that real-device login works.

## Remaining release work

- Complete device verification and fix any native build/runtime issues it reveals.
- Add verified Android HTTPS App Links using the final signing certificate and the website's `/.well-known/assetlinks.json`. Public QR links currently open the website; this prototype registers only the private login callback scheme.
- Add native image sharing for story cards. Browser sharing is retained but must be checked in the WebView; direct Instagram Story integration is not implemented.
- Implement authenticated in-app account deletion. The current public deletion page describes a manual email process and is not an implemented in-app deletion flow.
- Review current store disclosures, privacy/support URLs, screenshots, accessibility, and content requirements; enroll and run the required testing track; generate a signed Android App Bundle.
- Prepare iOS on a Mac, add the iOS platform and callback settings, implement a compliant additional login option such as Sign in with Apple, and test through TestFlight. No iOS project has been generated here.

Capacitor's app identifier is provisionally `com.sideout.valencia`. Confirm it before creating a production store listing, since published package identifiers are difficult to change.

## Validation commands

From the `website` directory:

```powershell
node --test tests/mobile.test.mjs tests/service.test.mjs tests/qr.test.mjs tests/play-ui.test.mjs
```

The complete website suite also includes local-server integration tests. This implementation environment blocks loopback network connections (`EACCES`), so those tests cannot complete here; run `npm test` in an unrestricted local terminal as well.

## Reference documentation

- https://capacitorjs.com/docs/getting-started
- https://capacitorjs.com/docs/apis/app
- https://capacitorjs.com/docs/apis/browser
- https://supabase.com/docs/guides/auth/sessions/pkce-flow
- https://supabase.com/docs/guides/auth/redirect-urls
