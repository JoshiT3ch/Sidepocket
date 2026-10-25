# Court Owner and paid booking plan

Status: product requirements confirmed in part; implementation and live payment activation are pending provider provisioning. This document does not enable billing, paid reservations, or owner payouts.

## Confirmed commercial model

| Offering | Price | Access |
| --- | --- | --- |
| Premium / Verified Player | PHP 139 per month | Player membership badge and Hosting access |
| Court Owner | PHP 1,000 per month | Apply as a court owner; manage club and court listings, court photos, fixed prices, availability and reservations |
| Sideout booking fee | PHP 50 per booking | Deducted from the owner's listed booking price; not added to the player's total |

The user selected Sideout collecting the player's payment and subsequently paying the court owner. For an owner-set booking total of PHP 500, the player pays PHP 500, the owner's base share is PHP 450 and Sideout's service fee is PHP 50. This example excludes payment-provider and transfer charges. Their allocation is still to be agreed before live checkout.

The owner subscription and the booking fee are separate charges. Do not automatically offset subscription charges against booking balances. A reservation incurs the PHP 50 fee once, regardless of request retries; it is not a per-player fee.

## Separate permissions and approval

Player membership and owner membership have independent protected entitlement records and expiry dates. An owner does not need the PHP 139 player plan to manage their courts. Holding a player badge does not grant court ownership, editing, review, or payout rights. An account may hold both roles; no bundle or extra automatic charge is implied.

Use distinct public labels for the player membership badge and Court Owner badge. Court ownership review, an active owner subscription and payment-provider merchant readiness are separate checks. A paid subscription must never self-approve a venue or create a payout recipient.

Allow an owner to submit a club application for review before activating their subscription. Require ownership approval and an active owner plan before enabling real bookable listings. Require the provider's owner onboarding and marketplace capabilities before enabling payment collection or remittances. Expired owner plans must still allow servicing existing reservations, refunds and outstanding balances.

## Club and court management

The intended hierarchy is club → numbered courts → dated availability. For example: Pickleball Club Name → Court 1 / Court 2. Each physical court has a stable identifier, photos, description, fixed price, opening hours and bookable slots. Court numbers must be unique within the club. Only the owning account or an explicitly authorized manager may modify these details.

Keep Hosting for social events and add a deliberate Courts / Book a court route for reservations; the current `#courts` alias opens Hosting. Reuse suitable existing booking validation and ownership review, while preserving current records.

The existing backend prices one-hour sessions. Hourly pricing is the proposed starting unit, pending confirmation if the owner instead wants a flat session price. The scope of PHP 1,000 per owner, club or physical court also remains to be finalized; it must be clear before any subscription is sold.

## Player booking flow

1. Select a club, numbered court, date and available time.
2. Review the owner-set total and the PHP 50 service-fee breakdown.
3. Create an expiring reservation hold and immutable server-calculated quote before checkout. The hold must prevent competing checkouts for the same slot.
4. Pay through the approved PayMongo payment flow. A return URL does not confirm payment.
5. Confirm the reservation only after a trusted payment event is verified against the booking, payer, merchant, currency, amount and environment.
6. Show a booking reference, payment status and the reserved court/time to the player and owner.
7. Reconcile settled funds and the owner's payable; record the payout separately from the booking payment.

Store all money in integer centavos: booking total 50,000; Sideout fee 5,000; owner's base share 45,000 in the PHP 500 example. Price changes affect new quotes only. Reject quotes that cannot support the service fee and the approved settlement rules without negative balances.

## Provider integration and settlement

PayMongo recommends Workflow-based payout splitting for new integrations. Ordinary Individual-account checkout is not evidence that collecting third-party booking revenue and paying venue owners is enabled. Obtain explicit provider approval for Sideout's disclosed marketplace model, linked owner onboarding, subscriptions, payment collection and settlement.

Owner payments need provider-approved recipients, immutable payment and transfer identifiers, idempotent webhook processing, a payment/refund ledger and an owner-payable ledger. A successful customer charge does not imply a completed owner payout. Failed, pending and returned remittances must remain visible for reconciliation.

Decide processor/transfer fee allocation, payout timing, cancellation policy, refunds, no-shows and disputes before launch. Do not describe funds as escrow or promise an unlimited provider hold: the documented Workflow external-event hold is limited to seven days.

## Existing backend gaps to address

The legacy `sideout_booking` API immediately confirms reservations without payment. It must be guarded or replaced before real paid courts are exposed. Its current unique index protects confirmed one-hour slots, not temporary payment holds. The current application-to-court relationship supports one photo and one court per application, rather than a club with multiple numbered courts.

The current `player_verifications` table is only a player entitlement and must not be reused as owner authorization. New paid records must preserve necessary transaction and booking history when an account or court is removed; the legacy cascading court/application deletion path is unsuitable for a financial ledger. Review privacy notices and the operator deletion helper with the final retention policy.

## Provider references

The owner authorized sending the disclosed marketplace model to PayMongo support. The request was sent to `support@paymongo.com` on 25 October 2026, separately from the existing Maya subscription activation ticket `64354a9c-fce7-3d94-9831-f68ffd5caa41`. Marketplace approval, account-specific fees and settlement configuration are awaiting a provider response.

- [Payment splitting and platform prerequisites](https://docs.paymongo.com/docs/payment-acceptance-payment-splitting)
- [Linked accounts and owner activation](https://docs.paymongo.com/docs/account-settings-linked-accounts)
- [Workflows](https://docs.paymongo.com/docs/fiaas-workflows)
- [Hold a payout until confirmed](https://docs.paymongo.com/docs/fiaas-workflows-hold-a-payout-until-confirmed)
- [Subscriptions and merchant capabilities](https://docs.paymongo.com/docs/account-settings-account-capabilities)

Recorded: 25 October 2026, Asia/Manila.
