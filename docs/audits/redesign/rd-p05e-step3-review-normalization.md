# RD-P05E — Step 3 Review normalization

Status: IMPLEMENTED — GITHUB VALIDATION PENDING
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

## Validation gate

Before RD-P05E can close:

1. run the exact branch head through the standard `web-test` workflow, including typecheck, booking-core lint, Next.js build and local-server crawl;
2. open a non-mutating seeded `/book/regular-cleaning?step=3` browser smoke and verify service, customer/location, schedule, cleaner preference, add-ons and price review data render from persisted booking state;
3. verify edit controls can open and cancel without losing the persisted draft;
4. verify `Proceed to payment →` advances to `?step=4` without submitting a booking or entering payment details;
5. smoke one team-mode service such as Deep Cleaning and verify assigned team review state is preserved through the Step 3 → Step 4 transition;
6. intercept/mock backend requests so no booking, payment or Supabase mutation can occur.

If these pass, mark RD-P05E `PASSED / CLOSED` and proceed to the next controlled Booking V2 presentation slice.

## Authority boundary

No production deployment, Vercel configuration change, Supabase data/schema mutation, booking creation, payment submission or production customer traffic is authorized by RD-P05E.
