# Archived court applications and bookings

Hosting now replaces the Courts navigation and page. The following describes the retained legacy booking backend; see [Hosting](hosting.md) for the current interface.

The next paid court-owner model is documented in [Court Owner and paid booking plan](court-owner-booking-plan.md): separate PHP 139 player and PHP 1,000 owner memberships, with PHP 50 deducted per booking. It supersedes the historical planned PHP 100 membership below and is awaiting provider provisioning.

The Courts page now uses `bookings.js` and `bookings.css`, replacing the retired community check-in screen. Existing directory records, check-ins, and Friends court sharing remain intact.

Court 1 is a free, clearly marked test venue. A reservation here never implies a real venue booking. Signed-in players can reserve one-hour slots up to 30 days ahead, view bookings, and cancel before the start time. Philippine time is used on both client and database. A partial unique database index prevents duplicate confirmed reservations for the same slot. Owners see and can cancel their courts' upcoming reservations. Cancellation retains history and releases availability.

Only players with an unexpired protected verified entitlement can submit or resubmit court applications. Planned membership is PHP 100 per month with a profile checkmark. There is no checkout, recurring charge, payment claim, or browser action to grant verification. Editing profile JSON or user metadata cannot grant verification. Public player views expose only a boolean checkmark, never membership expiry or billing details.

Owners apply per physical court with name, address, description, private owner contact, private ownership/business reference, hourly price, opening/closing hours, and an optional photo. Photos are re-encoded as bounded JPEG data and stay private until approval. New applications are limited to five per owner per day. Assigned reviewers approve or request changes; owners cannot approve their own courts. Approved courts become bookable; returned applications can be corrected and resubmitted.

All new tables are private with RLS and no browser table grants. The invoker gateway `sideout_booking` calls a private authorization function. Applicants and reviewers can read application details. Players see only occupied/free slots. Owners see player names/codes only for their courts' reservations. Payment for future paid courts is arranged with the owner.

Before accepting real applications, designate the reviewer account and provision verified entitlements through trusted operator actions. No real reviewer or verified player is seeded. Follow `supabase/admin/court-operations.md`. Subscription checkout, renewals, and payment webhooks are future work.

Validation: the Node suite, rollback-only `supabase/tests/bookings.sql` lifecycle/authorization fixtures in embedded PostgreSQL and hosted Supabase, existing SQL regression fixtures, and a live Court 1 reservation/cancellation check.
