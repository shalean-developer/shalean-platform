# RD-P05G — Booking UI closure audit

Status: PASSED / CLOSED
Branch: `design/rd04-platform-redesign`
Validation base: `validation/rd-p05g-base` @ `050a3b034945fd92339e5b5da0da2bef71817bcc`
Validated implementation head: `c44480a78d430598d34b7170befc0102882d212c`
Validation PR: #457 — validation only; close unmerged.
Scope: verification-only closure audit for RD-P05 Booking UI. No runtime redesign change was authorized or made by this slice.

## Governing authority

RD-P05A defines RD-P05G as the final Booking UI closure audit. The required closure evidence is:

- desktop/mobile regression coverage across all six governed service flows;
- accessibility/semantic regression coverage for the booking hub and step navigation;
- Booking V2 draft resumability;
- referral/promotion/source parameter retention across step navigation;
- step-transition preservation through Review and Payment;
- no real payment completion and no production data mutation.

The governed service flows are:

1. Regular Cleaning — `regular-cleaning`
2. Deep Cleaning — `deep-cleaning`
3. Moving Cleaning — `moving-cleaning`
4. Office Cleaning — `office-cleaning`
5. Carpet Cleaning — `carpet-cleaning`
6. Airbnb Cleaning — `airbnb-cleaning`

## Pre-closure evidence review

RD-P05B, RD-P05C, RD-P05E and RD-P05F were already recorded as `PASSED / CLOSED`.

RD-P05D had also completed its exact-head validation and validation-only PR #444 was closed unmerged, but its audit text still carried the earlier `LOCAL VALIDATION PENDING` status. RD-P05G reconciled that documentation-only inconsistency to `PASSED / CLOSED`; no Step 2 runtime code changed.

The RD-P05F closure head `050a3b034945fd92339e5b5da0da2bef71817bcc` was pinned as the P05G baseline.

## Authority preserved

RD-P05G did not modify:

- `BookingV2Context` draft persistence, URL step routing, validation or rebook/prefill behavior;
- `step1Schema` or `buildStep2Schema` validation contracts;
- live catalog, pricing, fees or `useBookingV2Pricing()` authority;
- service-area resolution, availability, slot filtering, cleaner/team selection or recurring scheduling;
- Step 3 review calculations, draft editing or Review → Payment state;
- Step 4 authentication, referral/promo/credit, quote readiness, pending booking creation/recovery, Paystack lifecycle, success redirects or payment analytics;
- booking/payment APIs, Supabase schema/data, production configuration or production customer traffic.

## Closure validation implementation

RD-P05G changed only verification/documentation files relative to the pinned baseline:

- `.github/workflows/booking-v2-closure-smoke.yml`
- `apps/web/e2e/smoke/booking-v2-closure.spec.ts`
- `docs/audits/redesign/rd-p05d-step2-schedule-normalization.md`
- `docs/audits/redesign/rd-p05g-booking-ui-closure.md`

No Booking V2 runtime TSX/CSS/business-logic file is present in the base-to-implementation-head diff.

## Dedicated closure smoke

The P05G smoke is hermetic and non-mutating. It intercepts `/api/**`, returns local fixtures/404s for GET requests, permits analytics telemetry through a local 204 stub, and aborts/records every other non-GET API request.

It verifies:

### Booking hub

- `/book` renders the governed booking entry surface;
- exactly six governed service links are present;
- all six service names are exposed as headings;
- the personalised-quote fallback remains available;
- desktop and 390px mobile layouts have no horizontal overflow.

### All six Step 1 flows

For every governed service on desktop and 390px mobile:

- `Your details` renders;
- the `Booking progress` navigation is exposed semantically;
- Details carries `aria-current="step"`;
- Back to services and Continue remain accessible by button role/name;
- no horizontal overflow occurs;
- no mutating request is attempted.

### Resumability + Review ↔ Payment

For every governed service:

- a local Booking V2 draft is seeded under `shalean:booking-v2:v1`;
- Step 3 Review renders from that persisted draft;
- a reload preserves the draft and Review state;
- `promo=P05G10`, `source=rd-p05g` and `ref=FRIEND123` remain present;
- `Proceed to payment →` advances to Step 4 while retaining those parameters;
- Payment exposes the semantic progress state and remains within the viewport;
- Back returns to Review while retaining the parameters and draft;
- `pendingBookingId` remains null;
- no booking confirmation/payment mutation is attempted.

## Initial closure-run finding

The first P05G closure run exposed only a test timing defect: the URL assertion could read `step=3` immediately after clicking Review → Payment before the Next.js route transition completed. The booking runtime itself was not changed in response.

The fix was test-only:

- parameter/step verification now uses `expect.poll` until the transition settles;
- Review/Payment heading waits were given the same bounded 10-second CI tolerance.

No runtime file changed as part of that correction.

## Exact-head validation evidence

Validated implementation head: `c44480a78d430598d34b7170befc0102882d212c`.

### Booking V2 closure workflow

Workflow run: `33250392419`
Job: `99094966611`
Conclusion: **success**

The exact-head checkout and SHA equality checks passed. TypeScript typecheck passed. The combined closure + regression suite reported:

- **20 passed / 20 total**;
- booking hub desktop/mobile closure coverage;
- all six governed services on Step 1 desktop/mobile;
- all six services for draft reload + Review ↔ Payment + query-parameter retention;
- RD-P05D Step 2 schedule regressions;
- RD-P05E Step 3 review regressions;
- RD-P05F Step 4 payment regressions.

No forbidden API mutation was attempted by the closure scenarios. No auth form was submitted, no booking was confirmed, no payment session was started and no Paystack flow was launched.

### Standard web gate

Workflow run: `33250392543`
Conclusion: **success**

The standard repository gate passed on the same exact implementation head, including:

- production dependency audit;
- critical payment/referral tests;
- privileged Office email security contract;
- revenue-path tests;
- marketing/Meta compliance tests;
- blog route governance;
- TypeScript typecheck;
- Booking core ESLint;
- SEO/canonical/Search Console readiness gates;
- production-mode Next.js build;
- local internal-link crawl;
- location/compliance route matrix.

### Migration governance

Workflow run: `33250392439`
Conclusion: **success**.

### Diff-scope proof

Comparison from the pinned P05G base `050a3b034945fd92339e5b5da0da2bef71817bcc` to implementation head `c44480a78d430598d34b7170befc0102882d212c` contained exactly four files, all validation/documentation artifacts listed above. No booking runtime code was changed by RD-P05G.

## Closure decision

RD-P05G is **PASSED / CLOSED** subject only to the final audit-only head rerunning the same exact-head guards before validation PR #457 is closed unmerged.

The RD-P05 Booking UI sequence has therefore satisfied its governed implementation and regression evidence across the hub, Details, Schedule, Review and Payment presentation slices without altering canonical booking/payment authority.

## Authority boundary

No production deployment, Vercel configuration change, Supabase schema/data mutation, production customer traffic, real booking confirmation, Paystack launch or payment completion was performed or authorized by RD-P05G.
