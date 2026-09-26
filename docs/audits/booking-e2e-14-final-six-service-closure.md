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
| Assignment / accept / start / complete | PASS | PENDING-RUNTIME | PENDING-RUNTIME | PENDING-RUNTIME | PENDING-RUNTIME | PENDING-RUNTIME |
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

## Regular cleaner lifecycle — 14B.2

Pricing-test booking `SHL-BK-000042` / `92ea1421-df46-4718-86fc-2526aaf6bdca` has progressed through the selected-cleaner lifecycle:

- Preferred offer accepted; booking `dispatch_status=assigned`.
- `cleaner_id` now matches the original `selected_cleaner_id`.
- Booking `accepted_at` persisted.
- Cleaner marked en route; `en_route_at` persisted.
- Cleaner started the job; `status=in_progress`, `cleaner_response_status=started`, `started_at` persisted.
- Preferred offer remains `status=accepted` with canonical R300 earnings snapshot.
- Cleaner earnings ledger row is not created yet, which remains expected until completion/finalization.
- Cleaner completion is currently blocked by the canonical 90% on-site duration gate: persisted duration 366 minutes → required minimum 329.4 minutes, rounded to 330 minutes.

Regular assignment / accept / en-route / start: **PASS**. Completion / payout: **PENDING**.


## Regular completion blocker — B14-003

On pricing-test booking `SHL-BK-000042` / `92ea1421-df46-4718-86fc-2526aaf6bdca`, cleaner completion is correctly blocked by the payout financial-cap guard, but the guard is using the wrong basis for a fully covered R0 prepaid booking.

Runtime evidence:
- `payment_status=success`, `billing_type=prepaid`.
- Collected cash columns are intentionally zero: `total_paid_cents=0`, `amount_paid_cents=0`, `total_paid_zar=0`.
- Quote/service value remains R680 in `pricing_summary.total`, `price_snapshot.server_computed_total`, with R680 Cleaning Credit settled.
- Canonical cleaner payout is R300.
- `persistCleanerPayoutIfUnset` logs `cap=0`, `hybrid=30000` and returns `payout_exceeds_financial_cap`.
- Booking remains `in_progress`; no payout columns or cleaner earnings ledger were written.

Root cause: prepaid financial-cap semantics equate "cash collected" with the maximum payable cleaner amount. That is invalid for a fully settled booking funded by Cleaning Credit (and potentially other company-funded discounts), where collected cash may be R0 while the service still has non-zero settled economic value.

Required closure: preserve the financial safety cap, but give settled non-cash prepaid bookings an authoritative service-value / settlement-value basis. Do not fake cash collected, change the R0 payment ledger, or bypass the cap.

## Regular completion & earnings ledger — B14-004

After BOOKING-E2E-14B.3, pricing-test booking `SHL-BK-000042` completed successfully with R300 booking payout/display earnings, but the earnings-ledger rail was still incomplete because no booking line items existed.

BOOKING-E2E-14B.4 was merged as PR #590 and deployed on pricing-test at `038ee48b2b93e16a12b6a67782a4f3a4522ae5ea`.

Runtime repair verification:
- authoritative visit subtotal line: R650,
- company-only service-fee line: R30,
- finalized line earnings total: R300,
- `cleaner_earnings_total_cents=30000`,
- exactly one `cleaner_earnings` ledger row,
- ledger total: R300,
- booking remains completed,
- payout status remains pending,
- replay of the repair produced no duplicate line items or ledger rows.

B14-004 result: **PASS / runtime repaired and replay-idempotent**.

## Deep team-picker runtime verification

Pricing-test release `0fd541e7721b64cedbf78f5a1a220f5d7ffd77b7` visually verifies the Deep Cleaning customer team-selection correction:

- Deep schedule now allows explicit customer team choice instead of silent auto-assignment.
- Selected team on Review: `Shalean Team 1`.
- No Move-team name is shown on the Deep booking.
- Review preserves the selected team in the booking summary.
- Review pricing remains internally consistent at R1,590 for the tested scope.

Deep Step 2 team selection / Step 3 preservation: **PASS**.

## Deep mixed-payment runtime — B14-005

Pricing-test booking `SHL-BK-000043` / `f087dbf8-f019-4d36-89c3-05f06de048c6` verifies the customer payment portion of the Deep matrix:

- Review total: R1,590.
- Cleaning Credit settled exactly once: R320.
- Paystack cash paid: R1,270.
- Booking `payment_status=success`.
- Selected Deep team persisted as Shalean Team 1.
- Team roster persisted with Test Cleaner A as lead and Test Cleaner B as member.
- `payout_owner_cleaner_id` correctly points to Test Cleaner A.

Post-payment lifecycle defect:
- booking remains `status=pending`,
- `dispatch_status=searching`,
- `assigned_at` is null,
- `cleaner_response_status=pending`,
despite `team_id`, `assigned_team_id`, `is_team_job=true`, payout owner, and roster already being present.

Root-cause trace: Booking V2 confirm reserves the selected team and roster before payment. After Paystack success, `promoteV2TeamBookingAfterPayment` sees `is_team_job=true` and `team_id===assigned_team_id` and returns after roster sync without promoting the booking lifecycle to operational assigned state.

B14-005 implementation: PR #592 merged and deployed to pricing-test at `7a055e42a35306ff90dc123af4f429a172450005`.

Runtime repair of SHL-BK-000043 replayed the merged guarded promotion conditions:
- exactly 1 booking row promoted,
- `status=assigned`,
- `dispatch_status=assigned`,
- `assigned_at` persisted,
- `cleaner_response_status=pending`,
- `cleaner_id` now equals the team lead / payout owner (Test Cleaner A),
- Shalean Team 1 and the two-row booking roster remained unchanged,
- payment remained successful,
- R320 Cleaning Credit remained settled,
- Paystack cash remained R1,270.

B14-005 assignment promotion result: **PASS**. Cleaner lifecycle and final team earnings/payout remain to be exercised.

## Deep team lead earnings display — B14-006

Pricing-test cleaner UI for `SHL-BK-000043` exposes a per-cleaner display mismatch after successful team promotion:

- Test Cleaner A is the persisted team lead and payout owner.
- Canonical `earnings_summary` records:
  - lead (Cleaner A): R270,
  - member (Cleaner B): R250,
  - total team cleaner earnings: R520.
- Booking-level `display_earnings_cents` is R250 (the generic per-member display lock).
- Cleaner A's Jobs card currently renders R250, so the lead sees the member amount instead of the canonical R270.

Root-cause trace: `resolveCleanerDashboardEarningsCents` checks the booking-level locked display amount before consulting `earnings_summary.per_cleaner_earnings`. For team jobs this masks the cleaner-specific lead uplift. The resolver needs team-aware precedence: viewer/member payout → per-cleaner summary → booking-level generic display; solo jobs should preserve existing policy-lock precedence.

B14-006 implementation: PR #593 merged and deployed to pricing-test at `0f3119b1c6cb67040129cb6d103d6ab91a5cdcec`. Runtime verification on Cleaner A now shows R270 consistently on Home/Next Job and job detail, while canonical team member payouts remain lead R270 / member R250. **PASS**.

## Legacy Deep UAT residue observed on Cleaner A

The Cleaner A detail screenshot for the overdue 24 Sep job is **not** SHL-BK-000043. It is legacy pricing-test booking `SHL-BK-000025` / `c111653c-36b9-4bee-95c2-1f6bf011ad39`.

Read-only verification:
- service: Deep Cleaning,
- paid successfully: R1,590,
- booking date/time: 24 Sep 2026 10:00,
- booking still `status=pending`, `dispatch_status=searching`, `assigned_at=null`,
- team persisted as **Dev Move Team Alpha** even though the service is Deep Cleaning,
- Cleaner A is the team lead / payout owner,
- booking-level stored display earnings are null,
- the detail page dynamically previews **R270** for Cleaner A.

This row predates the BOOKING-E2E-14 fixes and is historical UAT residue from both earlier defects:
1. pre-PR #591 Deep/Move shared team pool allowed a Move team on a Deep booking;
2. pre-PR #592 paid pre-reserved team lifecycle did not promote the row to assigned.

It was cleaned from pricing-test with a guarded terminal cancellation: `status=cancelled`, `cancelled_by=system`. Payment evidence was preserved unchanged at R1,590; no payout rows, cleaner earnings rows, or Cleaning Credit reservation existed. It no longer belongs in Cleaner A's open/upcoming workload. This is **not evidence that the newly deployed code still creates the defect**.

The R270 shown on this detail page also strengthens B14-006: the detail surface can resolve Cleaner A's lead-specific R270, while the Jobs list for current SHL-BK-000043 showed the generic R250 booking display lock.

## Deep lifecycle runtime after B14-006

Pricing-test booking `SHL-BK-000043` after release `0f3119b1c6cb67040129cb6d103d6ab91a5cdcec`:

- Cleaner A Home / Next Job: R270.
- Cleaner A job detail: R270.
- Canonical team member payout rows: lead R270, member R250.
- Accept: PASS.
- En route: PASS.
- Start: PASS.
- Current lifecycle: `status=in_progress`, `cleaner_response_status=started`.
- `accepted_at`, `en_route_at`, and `started_at` are persisted.
- Completion is blocked only by the expected on-site duration gate (473 minutes remaining at the captured test moment).

Deep team display and pre-completion lifecycle: **PASS**.

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
| B14-003 | Blocker | Regular R0 observed; settled discounted/credit-covered prepaid scope | Cleaner completion / payout cap | Fully settled R0 prepaid booking has economic service value R680 and canonical cleaner payout R300, but payout cap derived only collected cash and resolved to R0. Draft PR #589 changes settled prepaid cap to greater of collected cash or persisted visit subtotal while keeping unpaid prepaid cash-only. Pricing-test read-only preflight: target cap becomes R650 and 0 existing payout rows violate the proposed constraint. | FIX-IN-PR-589 |

## Final release decision

**OPEN / NOT READY FOR PRODUCTION**

Do not close BOOKING-E2E-14 until the full runtime matrix is evidenced and every blocking issue above is closed or separately approved.
