# RD-P05F — Step 4 Payment presentation normalization

Status: PASSED / CLOSED
Branch: `design/rd04-platform-redesign`
Validation base: `validation/rd-p05f-base` @ `2e9ca72bb5565ed310185132ad831c170c26bdea`
Validated implementation head: `d042f871a8dc4f5e81ab544abd53dccae3f96054`
Validation PR: #454 — validation only; close unmerged.
Scope: presentation-only Booking V2 Step 4 normalization. No production deployment, production data mutation, booking/payment behavior change, Supabase mutation, pricing authority change, or real payment completion.

## Governing authority

RD-P05A requires Step 4 to be redesigned last and presentation-first. RD-P05F preserved exactly:

- sign-in / sign-up authentication requirements and form contracts;
- persisted booking recovery and pending booking ID behavior;
- quote-readiness gating;
- referral checkout discount eligibility and calculation;
- promotion auto-application, code validation and discount calculation;
- Cleaning Credit balance/application behavior;
- canonical booking confirmation and area-review fallbacks;
- Paystack payment-session creation/recovery and inline fallback;
- payment cancel/retry semantics;
- covered-payment success handling;
- success redirects and draft clearing semantics;
- booking funnel and payment analytics;
- server-owned charge calculation and pricing authority.

## Baseline implementation audit

`Step4Payment.tsx` owns two visible states:

1. unauthenticated `AuthGate` with sign-in/sign-up forms and server/error states;
2. authenticated `PaymentSection` with order summary, promo/referral/credit presentation, quote-readiness/error states, secure-pay CTA, trust copy and terms links.

The payment file also contains the high-risk confirm/payment lifecycle. To reduce regression risk, RD-P05F intentionally left `Step4Payment.tsx` unchanged and applied presentation normalization through the canonical shell scope.

`Step4Payment.tsx` blob SHA is unchanged from the RD-P05F base through the validated implementation head:

- base `2e9ca72...`: `6c935e39cce5d9850f6b5c3aec83d6b9d16b4632`
- implementation `d042f871...`: `6c935e39cce5d9850f6b5c3aec83d6b9d16b4632`

## Implemented presentation scope

- added a Step 4-only shell style scope without changing step routing or navigation behavior;
- normalized Payment/Auth typography to semantic foreground and muted roles;
- normalized card, border, radius, surface and shadow treatment;
- normalized auth mode tabs, form controls, focus states and primary actions;
- normalized order-summary / discount / credit / warning / error surfaces while preserving their semantics;
- retained payment labels, values, actions and disabled states;
- normalized responsive spacing without adding nested scrolling;
- retained the existing Terms/Privacy links and trust messaging.

Runtime presentation files changed relative to the pinned base:

- `apps/web/src/features/booking-v2/BookingV2Shell.tsx`
- `apps/web/src/features/booking-v2/BookingV2Shell.module.css`

Validation-only files added:

- `apps/web/e2e/smoke/booking-v2-step4.spec.ts`
- `.github/workflows/booking-v2-step4-smoke.yml`
- this audit record.

## Non-mutating Step 4 browser smoke

The Step 4 Playwright gate deliberately runs unauthenticated with Supabase browser configuration disabled. It:

- seeds a local Booking V2 draft;
- opens `/book/regular-cleaning?step=4`;
- verifies Payment/Auth presentation and sign-in/sign-up mode switching without submitting either form;
- checks desktop and 390px mobile horizontal containment;
- verifies Back returns Step 4 → Step 3 while preserving the local booking draft;
- intercepts `/api/**` and aborts/records every non-GET request;
- fails if any booking/payment mutation is attempted.

No sign-in submission, booking confirmation, payment-session request or Paystack launch occurs in the smoke.

The first two Step 4 smoke attempts exposed Playwright selector ambiguity only (`Sign in` matched both a mode tab and submit button; `Password` matched the input and show-password control). Both fixes were test-selector-only. No runtime or payment behavior was changed in response.

## Exact-head validation evidence

Validated implementation head: `d042f871a8dc4f5e81ab544abd53dccae3f96054`.

Passed on that exact head:

- `migration-governance` — success;
- `booking-v2-step2-smoke` — success regression;
- `booking-v2-step3-smoke` — success regression;
- `booking-v2-step4-smoke` — success, non-mutating;
- `web-test` — success, including production dependency audit, critical payments/referrals tests, revenue-path tests, typecheck, Booking core ESLint, SEO gates, production-mode Next.js build, local internal-link crawl and route-matrix checks.

The audit-only follow-up head `6fa253aac6208d0d6879d5ef739ca44ceeab19a4` also passed migration governance, Step 2, Step 3, Step 4 and the full `web-test` gate.

The base-to-head diff contains only the two shell presentation files, the Step 4 test/workflow and this audit document. `Step4Payment.tsx` is not in the diff.

## Local visual validation

Local visual validation was supplied and approved on 2026-08-29 from the test environment Payment screen.

Observed and accepted:

- clear Payment → Confirm & pay hierarchy;
- readable service/address and fee breakdown;
- promo input and referral-warning state remain visually contained;
- total-to-pay amount and secure payment CTA are prominent;
- trust points and Terms/Privacy links remain visible;
- Back navigation remains visually distinct;
- no visible horizontal overflow, clipping or nested-scroll defect;
- no booking/payment action was required to approve the presentation.

The screenshot showed an authenticated test-session Payment state. This is acceptable as a visual-only gate because CI separately validates the unauthenticated auth-gate presentation without submitting authentication or payment requests.

## Closure

RD-P05F is PASSED / CLOSED.

No booking was confirmed for this closure, no payment was initiated or completed, no Paystack session was launched, no Supabase schema/data mutation occurred, and no production deployment/customer traffic was authorised.

Validation PR #454 must be closed without merge after the final audit-only exact-head checks are green.

Next formal slice: **RD-P05G — Booking UI closure audit**.
