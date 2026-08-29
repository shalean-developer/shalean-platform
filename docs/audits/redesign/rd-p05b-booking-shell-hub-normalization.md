# RD-P05B — Booking shell + `/book` hub normalization

Status: IMPLEMENTED — LOCAL VALIDATION PENDING
Branch: `design/rd04-platform-redesign`
Scope: presentation-only normalization of the booking entry hub and shared booking shell. No production deployment or data mutation.

## Authority preserved

RD-P05B does not modify:

- `BookingV2Context` state, localStorage draft persistence, URL step routing or rebook/prefill behavior;
- Step 1–4 form fields, validation schemas or question visibility rules;
- live booking catalog, pricing, fees or scheduling authority;
- service-area resolution, availability, cleaner/team selection or recurring rules;
- referral, promotion or cleaning-credit eligibility;
- booking confirmation, pending-booking recovery or Paystack lifecycle;
- booking/payment APIs, Supabase schema/data, RBAC, analytics event definitions or production configuration.

## Implemented presentation normalization

### `/book` hub

`apps/web/app/(ui-redesign)/book/page.tsx`

- moved the page surface, cards, borders, typography and focus treatment onto the approved semantic design tokens;
- kept the live `loadBookingV2Catalog()` price source and exact `SERVICE_SLUGS` route generation;
- retained the service-intent redirect compatibility path unchanged;
- retained quote and growth attribution destinations unchanged;
- reused the canonical `Button` primitive for the quote CTA;
- strengthened trust/payment presentation without changing trust or payment behavior.

Commit: `58eb8ecb` — `RD-P05B: normalize booking hub surface`

### Booking hub header

`apps/web/components/booking/BookIndexHeader.tsx`

- normalized border, surface, text and mobile call control to semantic tokens;
- aligned header content to the canonical wide container/gutter scale;
- preserved home, account/login and phone destinations.

Commit: `296b9260` — `RD-P05B: normalize booking hub header`

### Shared booking-flow header + progress

`BookingV2Header.tsx` and `BookingV2StepIndicator.tsx`

- normalized sticky header chrome, semantic colors and spacing;
- normalized active/completed/future progress states and connector treatment;
- preserved completed-step click behavior and `aria-current="step"` semantics;
- preserved home, login/account and phone behavior.

Commits:

- `ce138b0f` — `RD-P05B: normalize booking flow header`
- `4ccdb4fd` — `RD-P05B: normalize booking progress stepper`

### Shared booking shell

`BookingV2Shell.tsx`

- normalized page/loading surfaces, container widths, step-card chrome and elevation to the approved semantic token system;
- reused the canonical `Button` primitive for Back / Continue / Proceed to payment navigation;
- retained the exact `goBack`, `goNext`, current-step and sidebar-summary conditions;
- retained the existing Step 1–4 components without modification.

Commit: `6fddd3e0` — `RD-P05B: normalize booking flow shell`

## Diff-scope verification

Comparison from RD-P05A head `811afaed` to the implementation head showed exactly five presentation files changed:

1. `apps/web/app/(ui-redesign)/book/page.tsx`
2. `apps/web/components/booking/BookIndexHeader.tsx`
3. `apps/web/src/features/booking-v2/BookingV2Shell.tsx`
4. `apps/web/src/features/booking-v2/components/BookingV2Header.tsx`
5. `apps/web/src/features/booking-v2/components/BookingV2StepIndicator.tsx`

No Step 1–4, context, pricing, booking API or payment file changed in RD-P05B.

## Local validation gate

Before RD-P05B can close:

1. pull the latest `design/rd04-platform-redesign` head;
2. run `npm --prefix apps/web run typecheck`;
3. with the local-only web server running, confirm `/book` and one canonical flow such as `/book/regular-cleaning` return `200`;
4. desktop + mobile smoke `/book` for six service cards, live prices, header/account/phone controls, quote CTA, focus/spacing and no overflow;
5. desktop + mobile smoke `/book/regular-cleaning` Step 1 for header/stepper/shell/summary/nav presentation only;
6. verify Back to services returns to `/book` and no booking/payment completion is performed.

If these pass, mark RD-P05B `PASSED / CLOSED` and proceed to RD-P05C — Step 1 Details normalization.

## Authority boundary

No production deployment, Vercel configuration change, Supabase data/schema mutation, booking creation, payment completion or production customer traffic is authorized by RD-P05B.
