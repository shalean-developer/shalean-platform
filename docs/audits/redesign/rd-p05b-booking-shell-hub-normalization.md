# RD-P05B — Booking shell + `/book` hub normalization

Status: PASSED / CLOSED
Branch: `design/rd04-platform-redesign`
Scope: presentation-only normalization of the booking entry hub and shared booking shell. No production deployment or data mutation.

## Authority preserved

RD-P05B did not modify:

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

## Final local validation evidence

RD-P05B passed the local validation gate:

- `npm --prefix apps/web run typecheck` exited cleanly with no TypeScript errors;
- `GET /book` returned `200`;
- `GET /book/regular-cleaning` returned `200`;
- desktop `/book` smoke confirmed six service cards, live prices, trust strip, header/account/phone controls and quote CTA with no visible horizontal overflow;
- mobile `/book` smoke confirmed single-column service-card stacking, readable prices/CTAs, usable quote fallback and no visible horizontal overflow;
- desktop `/book/regular-cleaning` Step 1 smoke confirmed aligned booking header + four-step progress indicator, main form/summary separation, Back/Continue navigation and stable shell spacing;
- mobile Step 1 smoke confirmed header/stepper fit at narrow width, collapsed summary accessibility, field controls within the viewport, and reachable full-width Continue / Back to services controls;
- browser element-inspector overlays and Next.js development “Compiling…” badges observed during validation were development tooling, not product UI;
- no booking or payment was completed during validation.

## Closure decision

RD-P05B is `PASSED / CLOSED`.

Next controlled slice: **RD-P05C — Step 1 Details normalization**.

## Authority boundary

No production deployment, Vercel configuration change, Supabase data/schema mutation, booking creation, payment completion or production customer traffic was authorized or performed by RD-P05B.
