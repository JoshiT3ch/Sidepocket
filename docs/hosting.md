# Hosting

Hosting replaces the Courts page with scheduled doubles events. It preserves the old courts, applications, reservations, check-ins, and Friends location choices. Old `#courts` links open Hosting.

The event list groups real events by Philippine date and shows start/end times, venue, category, and confirmed/capacity counts. Upcoming lists published events that have not ended. My events includes the host’s events and the caller’s responses. Past lists ended events. Details includes address, fee, notes, host, and an ICS calendar download. Participants includes public player projections and open spots. There are no seeded example events or attendance counts.

Only the existing protected, unexpired account verification grants creation and editing. Each event has one host, who is automatically confirmed and included in capacity. Hosts can manage requests and cancel their event after verification expires. Categories describe the intended group; character appearance is not an eligibility check. Venue availability and any fees are arranged by the host.

Players request to join and wait for the host to approve. Maybe and Can’t go are responses rather than confirmed spots. Leaving a confirmed spot requires an inline confirmation and a new join request requires approval. Approval locks the event row and rechecks capacity; repeated requests and responses are idempotent. Hosts cannot withdraw their own confirmed spot. Only the host sees pending requests. Signed-in players see confirmed public player names, avatars, ratings, and checkmarks; account emails are never included.

`POST /api/hosting` uses actions `list`, `create`, `edit`, `request`, `respond`, `rsvp`, and `cancel`. The cloud transport calls `public.sideout_hosting(p_action,p_data)`, an invoker gateway to guarded private code. Tables live in the private `sideout` schema with RLS and no browser table privileges. Identity and verification are checked from current database state. Local SQLite mode uses the same contract and an operator-managed `player_verifications` table, independent of cloud accounts.

Create/edit inputs use one date with `HH:MM` start/end times in Asia/Manila. The start must be in the future within a year; the session ends on the same day and lasts at most 12 hours. Capacity is 2–100 including the host; fee is 0–10,000 whole pesos. Editing is allowed before the event starts and cannot shrink capacity below the confirmed count. Cancellation keeps event and participant history. Account deletion removes the target’s memberships and hosted events without changing other players’ ratings.

Run `npm test` for JavaScript/API regression checks and `supabase/tests/hosting.sql` for rollback-only SQL acceptance tests. Isolated browser fixtures cover verified creation, requests, host approval, capacity, RSVP release, editing/cancellation, and narrow screens. Do not grant a real account verification or create production example events to test this feature.
