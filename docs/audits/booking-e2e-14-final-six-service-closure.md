# BOOKING-E2E-14 — Final Six-Service Closure & Production Readiness

## Purpose

Final release gate for the Booking V2 customer journey across all six governed services:

- Regular Cleaning
- Deep Cleaning
- Moving Cleaning
- Office Cleaning
- Carpet Cleaning
- Airbnb Cleaning

Base under audit: `integration/shalean-release@c14889ecfab610b4a848fb560af3986f9ae6e851`

This register is audit-only. No production deployment, pricing formula change, database migration, payout rule change, referral rule change, or live customer-data mutation is authorised by this document.

## Release gate

**Current gate: OPEN — NOT READY FOR PRODUCTION**

The gate closes only when every required six-service runtime row below is PASS and every blocking issue is closed or explicitly accepted outside this audit.

## Required matrix

| Surface / transition | Regular | Deep | Moving | Office | Carpet | Airbnb |
|---|---|---|---|---|---|---|
| Step 1 Details | PENDING-RUNTIME | PENDING-RUNTIME | PENDING-RUNTIME | PENDING-RUNTIME | PENDING-RUNTIME | PENDING-RUNTIME |
| Step 2 Schedule / cleaner or team | PENDING-RUNTIME | PENDING-RUNTIME | PENDING-RUNTIME | PENDING-RUNTIME | PENDING-RUNTIME | PENDING-RUNTIME |
| Step 3 Review / edit round-trip | PENDING-RUNTIME | PENDING-RUNTIME | PENDING-RUNTIME | PENDING-RUNTIME | PENDING-RUNTIME | PENDING-RUNTIME |
| Step 4 Payment entry | PENDING-RUNTIME | PENDING-RUNTIME | PENDING-RUNTIME | PENDING-RUNTIME | PENDING-RUNTIME | PENDING-RUNTIME |
| Payment finalization | PASS-R0 / POSITIVE-PAYSTACK-PENDING | PENDING-RUNTIME | PENDING-RUNTIME | PENDING-RUNTIME | PENDING-RUNTIME | PENDING-RUNTIME |
| Customer dashboard | DB-OWNERSHIP-PASS / UI-PENDING | PENDING-RUNTIME | PENDING-RUNTIME | PENDING-RUNTIME | PENDING-RUNTIME | PENDING-RUNTIME |
| Admin dashboard / financial coherence | DB-PERSISTENCE-PASS / UI-PENDING | PENDING-RUNTIME | PENDING-RUNTIME | PENDING-RUNTIME | PENDING-RUNTIME | PENDING-RUNTIME |
| Cleaner/team dashboard | OFFER-PASS / ACCEPT-PENDING | PENDING-RUNTIME | PENDING-RUNTIME | PENDING-RUNTIME | PENDING-RUNTIME | PENDING-RUNTIME |
| Assignment / accept / start / complete | OFFER-PASS / ACCEPT-START-COMPLETE-PENDING | PENDING-RUNTIME | PENDING-RUNTIME | PENDING-RUNTIME | PENDING-RUNTIME | PENDING-RUNTIME |
| Completion / payout eligibility coherence | PENDING-RUNTIME | PENDING-RUNTIME | PENDING-RUNTIME | PENDING-RUNTIME | PENDING-RUNTIME | PENDING-RUNTIME |

## Static/read-only audit — 14A

### PASS — six governed service routes and canonical mappings

Booking V2 canonical persistence mapping is present for all six:

- `regular-cleaning -> standard`
- `deep-cleaning -> deep`
- `moving-cleaning -> move`
- `office-cleaning -> office`
- `carpet-cleaning -> carpet`
- `airbnb-cleaning -> airbnb`

Deep and Moving remain the team services; Regular, Office, Carpet and Airbnb remain individual-cleaner services.

### PASS — server confirmation stays service-aware

The Booking V2 confirm path:

- accepts only governed `SERVICE_SLUGS`,
- loads the locked pricing snapshot for the selected service,
- rebuilds the authoritative server price,
- validates team availability for team-mode services,
- validates individual-cleaner slot/preference state for non-team services,
- persists the canonical service slug and pricing snapshot,
- preserves pending-payment and zero-balance settlement boundaries.

### PASS — service-specific closeout regression coverage exists

Current focused tests cover:

- Regular database pricing and progressive details/schedule behavior,
- Regular/Deep parity and team schedule behavior,
- Deep progressive disclosure and recurrence rules,
- Moving progressive disclosure and move-specific fields,
- Office simplification, duration inputs, invalidation and payment revalidation,
- Carpet exact counts, database-authoritative extras, invalidation and payment revalidation,
- Airbnb access rules, database-authoritative extras, invalidation and payment revalidation,
- shared final-six stale-schedule and Review→Payment revalidation.

### PASS — shared dashboard/lifecycle contracts exist

Current automated contracts cover customer visibility/canonical lifecycle, cleaner lifecycle state mapping/completion owner stamping, admin booking visibility, positive earnings completion gates, and Cleaning Credit settlement/release authority.

These are shared lifecycle contracts; they are not yet a six-service runtime proof.

## Regular runtime evidence — 14B-R1

Booking `70212af9-8292-4e5d-ac3e-caca5d62286b` / `SHL-BK-000041` was created on pricing-test.

Verified database state:

- `service=regular-cleaning`, canonical `service_slug=standard`.
- Customer ownership persisted to `customer_id=f358591d-3304-4c68-943e-a66300beec68` and matching customer email.
- Authoritative gross quote = R440:
  - base R250,
  - bathroom R60,
  - two extra rooms R60,
  - ironing R40,
  - service fee R30.
- Cleaning Credit covered R440; payable and collected cash both R0.
- Booking `payment_status=success`, `amount_paid_cents=0`, R0 payment transaction linked.
- Payment ledger: `gateway=other`, `gateway_reference=r0:<bookingId>`, `amount_cents=0`, `settlement_status=settled`, `payment_channel=promo_credit_cover`.
- Cleaning Credit reservation settled exactly once; wallet balance after = R0; one spend row.
- Selected cleaner `10000000-0000-4000-8000-000000000006` exists, is active and available.

However, after successful R0 settlement:

- booking remains `pending_assignment` + `dispatch_status=searching`,
- `assignment_type=user_selected`,
- `cleaner_id=NULL`,
- `selected_cleaner_id` is populated,
- no `dispatch_offers` row exists,
- no `booking_cleaners` row exists,
- no `cleaner_earnings` row exists,
- no assignment/start/completion timestamps exist.

Static comparison confirms positive-Paystack finalization runs post-payment dispatch/assignment side effects in `upsertBookingFromPaystack`, while the R0 branch in Booking V2 confirm settles the booking then returns without invoking the equivalent dispatch boundary.

### B14-002 — R0 settlement skips post-payment assignment/dispatch side effects

**Severity:** Release-gate blocker  
**Status:** OPEN  
**Observed service:** Regular  
**Potential scope:** Any fully-covered Booking V2 service using the R0 path

**Runtime evidence:** `SHL-BK-000041` is payment-settled but has no dispatch offer/assignment/earnings path despite a valid selected cleaner.

**Code evidence:** `trySettleFullyCoveredOrError` / the R0 confirm branch settles Cleaning Credit and the R0 payment ledger, then returns `requiresPayment=false`. The positive-Paystack path separately runs selected-cleaner dispatch, auto-assignment/team promotion, booking side effects and later lifecycle/earnings work in `upsertBookingFromPaystack`.

**Required closure:** converge R0 post-settlement behavior on the same idempotent post-payment assignment/dispatch boundary without inventing cash, re-running settlement, or duplicating referral/Cleaning Credit effects.

## Regular R0 retest — 14B.1 verification

Fresh pricing-test booking `92ea1421-df46-4718-86fc-2526aaf6bdca` / `SHL-BK-000042` on merged release `a05ca957c0f8cc8b9f8941c233936c28865af110` verifies the B14-002 fix:

- `payment_status=success`, collected cash R0.
- R0 payment transaction is settled and linked.
- Cleaning Credit R680 settled exactly once; wallet retained R320.
- Customer-selected cleaner persisted as `Test Cleaner A`.
- Booking now moves to `dispatch_status=offered` rather than remaining `searching`.
- Preferred dispatch offer `64b7f784-d953-43f3-b665-3c641f729fa8` exists and is pending.
- Offer carries canonical `display_earnings_cents=30000` (R300).
- Lifecycle jobs were created for reminder/review.
- No cleaner earnings row yet, which is expected before accept/completion.

This closes the original stranded-R0 finding. Remaining Regular runtime work is cleaner acceptance, start, completion, dashboard convergence and payout closeout.

## Existing automation gap

### B14-001 — Six-service post-payment lifecycle matrix is not automated

**Severity:** Release-gate blocker  
**Status:** OPEN

Existing `booking-v2-closure-smoke` covers all six services through non-mutating customer-flow navigation and Review↔Payment routing, but it explicitly blocks mutations.

Existing Paystack/dispatch/lifecycle E2E specs exercise generic or load-test bookings and do not run the full Regular/Deep/Moving/Office/Carpet/Airbnb matrix through:

`payment -> customer dashboard -> admin dashboard -> cleaner/team dashboard -> lifecycle completion`.

Therefore current CI alone cannot close BOOKING-E2E-14.

**Required closure:** execute and record the six-service pricing-test runtime matrix below. Any defect becomes a numbered B14 issue.

## Runtime execution order

### 14B — Customer flow + authoritative payment
For each service:
1. Complete Details.
2. Complete Schedule and cleaner/team selection.
3. Review persisted values and edit round-trip.
4. Confirm price is stable into Payment.
5. Complete Paystack test payment or approved R0 path.
6. Record booking ID/reference, charged cash, locked quote, and service.

### 14C — Customer dashboard
For each paid booking verify:
- booking is visible to the correct customer,
- service/date/time/address/cleaner-or-team match,
- payment state is settled,
- displayed totals match authoritative booking/payment data,
- modify actions shown are valid for the current lifecycle state.

### 14D — Admin dashboard
For each booking verify:
- booking appears once,
- service and assignment are correct,
- collected cash is not confused with payable amount,
- quote/pricing snapshot is coherent,
- cleaner/team earnings fields are present and internally consistent,
- no payment/payout mismatch warning appears without cause.

### 14E — Cleaner/team dashboard + lifecycle
For each booking verify the applicable worker surface:
- offered/assigned visibility,
- accept where applicable,
- on-my-way / start,
- complete,
- customer/admin/cleaner surfaces converge after every transition.

For Deep and Moving, additionally verify team roster/payout-owner coherence.

### 14F — Financial/lifecycle closeout
After completion verify:
- completed booking remains payment-settled,
- cleaner earnings are positive and frozen correctly,
- payout eligibility/integrity is coherent,
- recurring continuation where applicable remains locked to the approved quote,
- referral/Cleaning Credit effects do not duplicate,
- dashboard/reporting values agree.

## Issue register

| ID | Severity | Service(s) | Surface | Finding | Status |
|---|---|---|---|---|---|
| B14-001 | Blocker | All six | Release automation | No automated six-service post-payment/dashboard/lifecycle runtime matrix; existing closure smoke is intentionally non-mutating. | OPEN |
| B14-002 | Blocker | Regular observed; generic R0 boundary | R0 post-payment dispatch | Root cause fixed by merged PR #587. Fresh R0 Regular SHL-BK-000042 created preferred dispatch offer with canonical R300 earnings snapshot and lifecycle jobs after zero-cash settlement. Cleaner accept/start/complete still pending runtime. | FIXED-RUNTIME-OFFER-VERIFIED |

## Final release decision

**OPEN / NOT READY FOR PRODUCTION**

Do not close BOOKING-E2E-14 until the full runtime matrix is evidenced and every blocking issue above is closed or separately approved.
