# FCO-01-C4 — Pricing, Equipment and Availability Regression

Status: IN PROGRESS / NOT ACCEPTANCE READY
Scope: read-only source inspection and isolated branch-only fixes. No live booking, database change, payment, Plesk activation, staging merge, or production deployment authorized.

## Source baseline
Draft PR #1083, branch `feature/fco-01-regular-booking-simplification-20261105`, base `production`.
The simplified journey remains fail-closed in production and off unless explicitly enabled in development/staging.

## Verified behavior and implemented repairs
1. **Address/equipment quote lifecycle** — Original `EquipmentSection` awaited a 400ms debounce before aborting the old active request, and its cleanup only cleared the timer. A prior request could complete after an address change. The effect now immediately clears `equipmentQuote` on every address/suburb/city/postal-code/equipment-scope change, owns an `AbortController` from effect creation, aborts on cleanup/unmount, and ignores late or aborted results.
2. **Competing quote resets** — The simplified Your Details wrapper had another effect clearing the fee at mount and scope changes. Removed that duplicate; `EquipmentSection` is now the sole owner of address-scoped quote invalidation while mounted.
3. **Forward navigation & restored drafts** — In addition to `goToStep` checks, the simplified journey now redirects direct URL/history navigation to Home when the Home answers are missing, Schedule when the schedule schema is incomplete, and Your Details when address/contact or equipment fee is unresolved before Payment.
4. **Existing authority preserved** — The present client gate retains `verifySelectedBookingV2Slot`, `verifySelectedBookingV2Cleaners`, `step1Schema`, `buildStep2Schema`, `canEnterBookingPayment`, and pending-payment supersession. The gate does not mutate booking/provider records.
5. **Regression coverage** — Added `regularSimplifiedEquipmentLifecycleC4.test.ts`, amended C2/C3 source-contract tests. These validate source invariants and selected pure helper behavior; they are not substitutes for browser integration.

## Critical unresolved financial/quote authority finding — C4-BLOCK-01
Source review of `apps/web/app/api/booking-v2/quote/route.ts` shows `quoteSchema` accepts client-supplied `equipmentQuote` as an arbitrary record and passes it to `buildSignedCustomerPricingFromForm` while producing a `quoteLock`.

Source review of `apps/web/app/api/booking-v2/confirm/route.ts` shows `serverEquipmentQuote` is selected from the submitted `data.equipmentQuote` and used again to build the signed breakdown. The inspected code does not establish independent server-side binding of the equipment logistics quote to the precise address or its validity. These source facts do not prove a successful exploitation path, but they mean client UI checks alone are insufficient assurance for financial correctness.

**Release blocker:** Before the new address-later journey can be activated, Software/Financial Engineering must design and test an authoritative, address-bound equipment-quote token or server-generated quote snapshot. Verify replay, altered address, changed suburb, missing quote, manual-quote-required status, disabled equipment delivery, tampered fee, expiry, double-click and pending-payment retry handling. Protect existing approved locked pricing semantics; do not simply reprice an already accepted signed quote during confirm without a defined reconciliation contract.

## Pending gates
- CI exact-head pass: critical tests, typecheck, relevant lint, Next Webpack build and booking-v2 smoke.
- Isolated synthetic desktop/mobile browser smoke at 320, 375, 768 and 1440px, with booking, payment and outbound analytics mutations intercepted.
- Server-authoritative equipment price linkage and financial regression (C4-BLOCK-01).
- Saved/custom address switching and service-area reassessment after edits.
- No PR merge, production flag enablement, or Plesk activation until separately authorized and fully accepted.

## Decision
FCO-01-C4 remains IN PROGRESS. Do not mark accepted or Ready for review on source-level checks alone.
