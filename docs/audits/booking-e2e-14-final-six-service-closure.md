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
| Payment finalization | PENDING-RUNTIME | PENDING-RUNTIME | PENDING-RUNTIME | PENDING-RUNTIME | PENDING-RUNTIME | PENDING-RUNTIME |
| Customer dashboard | PENDING-RUNTIME | PENDING-RUNTIME | PENDING-RUNTIME | PENDING-RUNTIME | PENDING-RUNTIME | PENDING-RUNTIME |
| Admin dashboard / financial coherence | PENDING-RUNTIME | PENDING-RUNTIME | PENDING-RUNTIME | PENDING-RUNTIME | PENDING-RUNTIME | PENDING-RUNTIME |
| Cleaner/team dashboard | PENDING-RUNTIME | PENDING-RUNTIME | PENDING-RUNTIME | PENDING-RUNTIME | PENDING-RUNTIME | PENDING-RUNTIME |
| Assignment / accept / start / complete | PENDING-RUNTIME | PENDING-RUNTIME | PENDING-RUNTIME | PENDING-RUNTIME | PENDING-RUNTIME | PENDING-RUNTIME |
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

## Final release decision

**OPEN / NOT READY FOR PRODUCTION**

Do not close BOOKING-E2E-14 until the full runtime matrix is evidenced and every blocking issue above is closed or separately approved.
