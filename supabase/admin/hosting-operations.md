# Hosting verification

Hosting uses the existing `sideout.player_verifications` entitlement and profile checkmark. No separate host application, subscription checkout, or browser action grants verification. Existing verified accounts can host immediately while their entitlement is active.

Grant or renew verification only after the owner explicitly authorizes the intended account and expiry. Resolve the exact immutable account UUID through the trusted operator console; never use editable profile names, JSON, or user metadata as authorization. See the entitlement procedure in [court-operations.md](court-operations.md). This feature does not automatically verify any real account.

Create and edit recheck the protected expiry on every request. The owner of an existing event retains request moderation and cancellation after expiry, so participants can still be managed. The creator occupies one confirmed spot; categories are advertised requirements for the host to review, not inferred from avatar appearance.

Use the rollback-only `supabase/tests/hosting.sql` fixture for database acceptance. It creates temporary users and protected entitlements, then rolls them back. Never use real players or production events as fixtures. The account deletion helper covers `hosted_events` and `hosting_participants`; deploy the Hosting migration before using the updated helper.
