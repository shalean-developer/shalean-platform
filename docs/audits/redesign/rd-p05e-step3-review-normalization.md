# RD-P05E — Step 3 Review normalization

Status: PASSED / CLOSED
Branch: `design/rd04-platform-redesign`
Scope: presentation-only normalization of Booking V2 Step 3. No production deployment or data mutation.

## Authority preserved

RD-P05E does not modify `Step3Review.tsx` or any review/business-logic dependency.

The slice therefore preserves:

- review values sourced from React Hook Form and `BookingV2Context`;
- service label, description, service details and live-catalog fallbacks;
- customer location, suburb, city, postal code, phone and access/parking/gate data;
- equipment choice and equipment quote display;
- schedule date/time, booking type, recurring frequency/days/start/end state;
- cleaner count, selected cleaner IDs/details, cleaner rehydration and best-available fallback;
- deep/moving assigned team ID/name and team-mode review state;
- selected add-ons and live/static extra fallback data;
- `pricingSummary`, estimated total, recurring monthly-spend calculation and amount-due copy;
- edit modal snapshot/save/cancel behavior and draft persistence;
- `BookingV2Provider`, pricing hook and funnel telemetry;
- the shared shell `goNext` transition from Step 3 into Step 4 Payment;
- booking confirmation, Paystack, payment state and production data paths.

## Implementation

RD-P05E follows the same presentation-boundary pattern used for RD-P05C and RD-P05D.

### `BookingV2Shell.tsx`

The shell applies `styles.step3` only when `currentStep === 3` and only on the existing no-outer-card Step 3 wrapper.

No navigation callback, provider, hook, step-rendering map, sidebar condition, Step 4 behavior or payment code changed.

### `BookingV2Shell.module.css`

The Step 3 presentation scope:

- uses canonical semantic foreground and muted text tokens for legacy slate text utilities;
- maps Step 3 primary accents to the canonical primary token while retaining the existing information hierarchy;
- normalizes review, price and trust surfaces to canonical card/border/radius/shadow tokens;
- normalizes neutral sub-surfaces and service highlight surfaces without changing displayed values;
- normalizes modal input/select/textarea surfaces to semantic form-control tokens;
- preserves 44px minimum control height and consistent focus-visible treatment;
- leaves all Step 3 DOM structure, conditional rendering and handlers in `Step3Review.tsx` untouched.

## Validation evidence

Validation-only draft PR: #447
Pinned base: RD-P05D closure head `b602513e048d3e9379ffdc9e85e871608d12f777`
Validated implementation head: `fc09066a6fb8aa2a9b64ff6f5765d5fd19e0bec9`

Exact-head GitHub validation passed:

- migration governance — passed;
- standard `web-test` — passed;
- TypeScript typecheck — passed;
- booking-core ESLint gate — passed;
- critical payment/referral and revenue-path tests — passed;
- Next.js production-mode PR build — passed;
- local PR server start — passed;
- internal-link crawl and route matrix — passed;
- RD-P05D Step 2 non-mutating browser regression smoke — passed;
- RD-P05E Step 3 non-mutating Playwright smoke — 2/2 passed.

The Step 3 smoke proved:

1. Regular Cleaning `/book/regular-cleaning?step=3` renders persisted service, location/customer, recurring schedule, selected cleaner, add-on fallback and calculated pricing state;
2. Location Edit can change the live draft and Cancel restores the snapshot/persisted value;
3. `Proceed to payment →` advances from Step 3 to `?step=4` without submitting a booking or entering payment details;
4. Deep Cleaning `/book/deep-cleaning?step=3` preserves assigned team state and advances to Step 4;
5. every non-analytics `/api/**` mutation is blocked by the browser-test sandbox and the tests assert that no forbidden mutation was attempted.

A first smoke run exposed only a fixture expectation mismatch: the test expected the friendly add-on label while its deliberately empty live catalog causes existing Step 3 fallback behavior to render the stored add-on ID. The test expectation was corrected; no runtime or business logic was changed.

## Diff-scope verification

From the RD-P05D closure head through validated RD-P05E implementation head, the slice changes only:

1. `apps/web/src/features/booking-v2/BookingV2Shell.tsx` — one Step-3-only CSS-module scope condition;
2. `apps/web/src/features/booking-v2/BookingV2Shell.module.css` — Step-3-only presentation normalization;
3. `apps/web/e2e/smoke/booking-v2-step3.spec.ts` — non-mutating validation coverage;
4. `.github/workflows/booking-v2-step3-smoke.yml` — exact-head browser validation workflow;
5. this audit record.

`Step3Review.tsx` retained blob SHA `73965182940a9702e187812df6ed65afdb67d04b` from the RD-P05D base through validation, confirming the review logic file was untouched.

## Closure

RD-P05E is `PASSED / CLOSED`.

No production deployment, Vercel configuration change, Supabase data/schema mutation, booking creation, payment submission or production customer traffic occurred or is authorized by this slice.
