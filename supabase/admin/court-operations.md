# Court reviewers and verified players

Run these operations only as a trusted database operator after independently identifying the intended account. Never derive privileges from editable names, profile JSON, or user metadata. No reviewer or real verified entitlement is seeded by the migration.

1. Locate the exact Google sign-in account using an email the owner supplies. Resolve its immutable `auth.users.id` in the Supabase operator console.
2. After the owner designates that account as a reviewer, insert its verified UUID into `sideout.court_reviewers(user_id)`. Reviewers use Courts → Verify court applications in the normal website. Do not grant a database role or service key.
3. Until billing is integrated, grant verification only for an explicitly approved trial or an independently confirmed manual subscription. Insert or update `sideout.player_verifications(user_id,verified_until)` with the verified UUID and intended expiry. Never grant verification from a client payment-success screen. A trial does not mean a PHP 100 payment was collected.
4. The member refreshes the website to get the profile checkmark. Application checks always use the current database entitlement. Expiry blocks new applications; existing listings and reservations remain accessible.

Do not use real accounts as test fixtures. `supabase/tests/bookings.sql` creates isolated accounts in a transaction and finishes with `ROLLBACK`. It verifies metadata spoofing rejection, membership expiry, reviewer authorization, rejection/resubmission, approval, privacy, slot conflicts, retry handling, cancellation ownership, released availability, closed hours, and authentication.

A future subscription integration must verify payment webhook signatures, deduplicate events, bind subscriptions to immutable account IDs, and update entitlements only from trusted events. Checkout, renewals, cancellation, failed payments, and webhook handling are not implemented.
