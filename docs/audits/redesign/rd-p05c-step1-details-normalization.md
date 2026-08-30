# RD-P05C — Step 1 Details normalization

Status: PASSED / CLOSED
Branch: `design/rd04-platform-redesign`
Scope: presentation-only normalization of Booking V2 Step 1. No production deployment or data mutation.

## Authority preserved

RD-P05C did not modify:

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

Comparison from RD-P05B closure head `cfe9ab53` to the RD-P05C implementation head showed exactly two files changed:

1. `apps/web/src/features/booking-v2/BookingV2Shell.module.css` — added presentation-only Step 1 styles;
2. `apps/web/src/features/booking-v2/BookingV2Shell.tsx` — one CSS-module import plus one conditional Step 1 class.

`Step1Details`, `PropertyAddressSection`, `EquipmentSection`, service-question controls, room-count controls and all business-logic files remained unchanged.

## Validation evidence

RD-P05C local validation passed on 2026-08-29:

- `npm --prefix apps/web run typecheck` completed with no TypeScript errors;
- `GET /book/regular-cleaning` returned `200`;
- desktop Step 1 smoke passed: clear About the clean / Property address / Equipment / access-information hierarchy, intact room selectors, saved-address presentation, contact phone, equipment-fee display, summary sidebar and navigation;
- mobile Step 1 smoke passed: the same hierarchy stacks cleanly, controls remain within the viewport with no visible horizontal overflow, the collapsed Booking summary remains available, and Continue / Back to services remain reachable;
- selected property type, room counts, pets/equipment toggle state and calculated equipment logistics fee rendered correctly, demonstrating the existing Step 1 state/pricing presentation remained intact;
- no optional extras were exposed by the active regular-cleaning live configuration during this validation, so the conditional extras-only smoke gate was not applicable to this booking state;
- browser inspector overlays visible in the screenshots were development tooling rather than application UI.

Because RD-P05C changed only scoped presentation CSS plus a conditional shell class, the previously validated booking navigation/state handlers remained untouched.

## Closure decision

RD-P05C is **PASSED / CLOSED**.

Next controlled slice: **RD-P05D — Step 2 Schedule normalization**, presentation-only. Preserve scheduling/availability authority, date/window rules, cleaner/team selection, recurring behavior, pricing impacts, draft persistence and booking state.

## Authority boundary

No production deployment, Vercel configuration change, Supabase data/schema mutation, booking creation, payment completion or production customer traffic was performed or authorized by RD-P05C.
