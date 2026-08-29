# RD-P05C — Step 1 Details normalization

Status: IMPLEMENTED — LOCAL VALIDATION PENDING
Branch: `design/rd04-platform-redesign`
Scope: presentation-only normalization of Booking V2 Step 1. No production deployment or data mutation.

## Authority preserved

RD-P05C does not modify:

- `Step1Details.tsx` field definitions, visibility gates, extras toggle behavior or React Hook Form registrations;
- `PropertyAddressSection.tsx` saved/custom address modes, suburb resolution, contact-phone validation, unsupported-area handling or profile/address prefill;
- `EquipmentSection.tsx` equipment-required state, equipment-quote API request, debounce, fee calculation or manual-quote handling;
- room-count selector behavior, custom-count handling, service-specific option-card behavior or yes/no field semantics;
- `BookingV2Context` draft persistence, URL step state, rebook/prefill behavior, pricing, availability, referral/promo/credit, confirmation or Paystack behavior.

## Implementation

RD-P05C adds a Step-1-only presentation scope rather than rewriting Step 1 components.

### `BookingV2Shell.module.css`

A new CSS module scopes Step 1 presentation to the Step 1 outer shell only:

- removes the redundant outer card chrome for Step 1 so the internal form sections become the visual hierarchy;
- groups direct Step 1 sections into semantic card surfaces using approved border, radius, card and shadow tokens;
- removes redundant divider rules between those cards;
- normalizes labels, input/select/textarea surfaces, focus treatment and placeholder color to semantic tokens;
- keeps mobile section padding compact and increases it from `sm` upward;
- preserves existing control dimensions while enforcing a minimum 44px form-control height.

Commit: `11d9c1c2` — `RD-P05C: add Step 1 presentation scope`

### `BookingV2Shell.tsx`

The shared shell imports the Step 1 CSS module and applies it only when `currentStep === 1`.

No Step 1 handler, Step 2–4 rendering condition, navigation callback, summary condition, provider, pricing hook or telemetry hook changed.

Commit: `4090d656` — `RD-P05C: scope Step 1 presentation normalization`

## Diff-scope verification

Comparison from RD-P05B closure head `cfe9ab53` to the RD-P05C implementation head shows exactly two files changed:

1. `apps/web/src/features/booking-v2/BookingV2Shell.module.css` — added presentation-only Step 1 styles;
2. `apps/web/src/features/booking-v2/BookingV2Shell.tsx` — one CSS-module import plus one conditional Step 1 class.

`Step1Details`, `PropertyAddressSection`, `EquipmentSection`, service-question controls, room-count controls and all business-logic files are unchanged.

## Local validation gate

Before RD-P05C can close:

1. pull the latest branch and run `npm --prefix apps/web run typecheck`;
2. confirm `/book/regular-cleaning` returns `200`;
3. desktop + mobile smoke Step 1 for section-card hierarchy, labels, room selectors, address, equipment fee state, access/parking/gate fields and navigation;
4. if a configured service exposes extras, smoke one extras-bearing Step 1 and verify selected/unselected extras remain readable and clickable;
5. verify changing a harmless Step 1 field still updates the UI and that Back/Continue remain functional, but do not complete a booking or payment.

If these pass, mark RD-P05C `PASSED / CLOSED` and proceed to RD-P05D — Step 2 Schedule normalization.

## Authority boundary

No production deployment, Vercel configuration change, Supabase data/schema mutation, booking creation, payment completion or production customer traffic is authorized by RD-P05C.
