# RD-P05G — Booking UI closure audit

Status: IN PROGRESS
Branch: `design/rd04-platform-redesign`
Validation base: `validation/rd-p05g-base` @ `050a3b034945fd92339e5b5da0da2bef71817bcc`
Scope: verification-only closure audit for RD-P05 Booking UI. No runtime redesign change is authorized by this slice.

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

RD-P05B, RD-P05C, RD-P05E and RD-P05F are recorded as `PASSED / CLOSED`.

RD-P05D had also completed its exact-head validation and validation-only PR #444 was closed unmerged, but its audit text still carried the earlier `LOCAL VALIDATION PENDING` status. RD-P05G reconciles that documentation-only inconsistency to `PASSED / CLOSED`; no Step 2 runtime code is changed by the correction.

The current RD-P05F closure head `050a3b034945fd92339e5b5da0da2bef71817bcc` is therefore the pinned P05G baseline.

## Authority that must remain unchanged

RD-P05G must not modify:

- `BookingV2Context` draft persistence, URL step routing, validation or rebook/prefill behavior;
- `step1Schema` or `buildStep2Schema` validation contracts;
- live catalog, pricing, fees or `useBookingV2Pricing()` authority;
- service-area resolution, availability, slot filtering, cleaner/team selection or recurring scheduling;
- Step 3 review calculations, draft editing or Review → Payment state;
- Step 4 authentication, referral/promo/credit, quote readiness, pending booking creation/recovery, Paystack lifecycle, success redirects or payment analytics;
- booking/payment APIs, Supabase schema/data, production configuration or production customer traffic.

## Closure validation implementation

RD-P05G adds validation/evidence only:

- `apps/web/e2e/smoke/booking-v2-closure.spec.ts`
- `.github/workflows/booking-v2-closure-smoke.yml`
- this closure audit record
- documentation-only reconciliation of the completed RD-P05D audit status.

No runtime TSX/CSS/business-logic file is intended to change in RD-P05G.

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

## Full regression gate

The dedicated P05G workflow also reruns the existing non-mutating Booking V2 regression specs:

- RD-P05D Step 2 schedule smoke;
- RD-P05E Step 3 review smoke;
- RD-P05F Step 4 payment smoke.

The workflow uses exact PR-head checkout, verifies the SHA, runs TypeScript typecheck, installs Chromium, and executes the closure + Step 2/3/4 Playwright suites on the local Next.js test server with browser Supabase configuration disabled.

The standard repository `web-test` remains required as the broader payment/referral/typecheck/lint/build/crawl guard.

## Closure criteria

RD-P05G may be marked `PASSED / CLOSED` only when:

1. the base-to-head diff is verification/documentation-only with no booking runtime code change;
2. dedicated all-six closure smoke is green;
3. Step 2, Step 3 and Step 4 non-mutating regressions are green;
4. standard `web-test` and migration governance are green on the exact validation head;
5. no real booking/payment, Paystack launch, Supabase mutation or production deployment occurs;
6. the validation-only PR is closed without merge.
