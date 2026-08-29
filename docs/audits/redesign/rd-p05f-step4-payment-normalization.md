# RD-P05F — Step 4 Payment presentation normalization

Status: IN PROGRESS
Branch: `design/rd04-platform-redesign`
Validation base: `validation/rd-p05f-base` @ `2e9ca72bb5565ed310185132ad831c170c26bdea`
Scope: presentation-only Booking V2 Step 4 normalization. No production deployment, production data mutation, booking/payment behavior change, Supabase mutation, pricing authority change, or real payment completion.

## Governing authority

RD-P05A requires Step 4 to be redesigned last and presentation-first. RD-P05F must preserve exactly:

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

The payment file also contains the high-risk confirm/payment lifecycle. To reduce regression risk, RD-P05F should prefer shell-scoped presentation normalization and avoid modifying Step 4 business logic.

## Planned presentation scope

- normalize Step 4 typography to semantic foreground/muted roles;
- normalize card, border, radius, surface and shadow treatment;
- normalize auth mode tabs, form controls, focus states and primary actions;
- normalize order-summary / discount / credit / warning / error surfaces;
- preserve payment labels, values, button actions and disabled states;
- normalize responsive spacing without adding nested scrolling;
- retain all existing Terms/Privacy links and trust messaging.

## Validation plan

- exact-head CI / typecheck / Booking core ESLint / build and crawl;
- existing Step 2 and Step 3 non-mutating browser regressions;
- dedicated Step 4 non-mutating browser smoke covering unauthenticated auth presentation and draft/back-navigation preservation;
- any `/api/**` mutation in the Step 4 smoke is blocked and fails the smoke;
- no sign-in submission, booking confirmation, payment-session request or Paystack launch in the browser smoke;
- local visual smoke after exact-head CI passes.

## Closure criteria

RD-P05F may close only when the exact implementation head passes CI and the Payment presentation is visually confirmed locally without completing a booking or payment.
