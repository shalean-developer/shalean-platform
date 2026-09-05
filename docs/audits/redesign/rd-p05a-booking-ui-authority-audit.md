# RD-P05A — Booking UI authority + implementation audit

Status: COMPLETE — READY FOR IMPLEMENTATION SLICES
Branch: `design/rd04-platform-redesign`
Scope: booking UI audit only. No production deployment, production data mutation, booking/payment behavior change, Supabase mutation, or pricing authority change.

## Active booking routes

The active Booking V2 customer routes live under `apps/web/app/(ui-redesign)/book`:

- `/book` — service-selection hub.
- `/book/[serviceSlug]` — canonical Booking V2 flow for one of the supported service slugs.
- `/book/payment` — compatibility route that redirects back to `/book`; payment is handled inside Booking V2 Step 4 rather than by this standalone page.

The `/book` layout is intentionally `noindex, nofollow`.

## Supported primary service flows

`/book` renders the supported `SERVICE_SLUGS` from Booking V2 config and uses the live Booking V2 catalog for displayed base prices. The current customer booking flows are:

1. Regular Cleaning
2. Deep Cleaning
3. Moving Cleaning
4. Office Cleaning
5. Carpet Cleaning
6. Airbnb Cleaning

The service hub also preserves marketing/legacy service intent instead of forcing a duplicate service choice.

## Canonical shell and step model

`BookingV2Shell` is the canonical customer booking shell. It owns:

- Booking V2 header and step indicator;
- responsive one-column / desktop summary layout;
- mobile collapsed summary;
- promotion booking banner;
- inline back/continue navigation;
- Step 1 Details;
- Step 2 Schedule;
- Step 3 Review;
- Step 4 Payment.

Steps 1–2 use the shell summary sidebar. Steps 3–4 deliberately avoid an additional outer card because they already contain section-level cards.

## Business-logic authority that RD-P05 must preserve

### Booking state and resumability

`BookingV2Context` is authoritative for step routing and client booking draft state. It:

- persists Booking V2 form state in localStorage under `shalean:booking-v2:v1`;
- restores persisted state after mount;
- merges legacy marketing/search-param prefill;
- restores rebook data from authenticated customer booking data or rebook token flows;
- preserves the selected service slug when rebooking;
- resets schedule/cleaner/team selections when service area changes;
- keeps step state in the URL query (`?step=1..4`).

RD-P05 presentation work must not replace, bypass, rename, or silently clear this state model.

### Validation

Step progression is guarded by Booking V2 schemas:

- Step 1 uses `step1Schema`.
- Step 2 uses `buildStep2Schema(scheduling)`.
- validation errors are written into React Hook Form and booking-funnel error analytics are emitted.

RD-P05 must preserve these validation gates and error-field mappings.

### Pricing and live service authority

Booking V2 fetches `/api/booking-v2/services` and uses returned catalog, fees, scheduling and live service configuration when available. Static `SERVICE_CONFIG` is only fallback authority.

`useBookingV2Pricing()` drives form pricing state and `BookingV2SummaryPanel` / payment price breakdown consume that state.

RD-P05 may restyle price presentation but must not hard-code pricing or move calculation authority into UI components.

### Service area and schedule authority

Step 2 depends on a resolved `serviceAreaLocationId`, Booking V2 scheduling configuration, slot filtering, and `useBookingV2ScheduleAvailability()`.

It also owns service-specific fulfillment behavior such as cleaner selection, team availability, recurring frequency/day selection and time-slot handling.

RD-P05 may redesign the calendar, time-slot, cleaner/team cards and selection presentation only if those existing value/change contracts stay intact.

### Referral, promotion and payment authority

Step 4 contains high-risk behavior including:

- sign-in/sign-up auth gate;
- persisted booking recovery;
- quote-readiness checks;
- referral checkout discount;
- promotion validation/auto-application;
- cleaning-credit application;
- pending booking state;
- Paystack confirmation/payment lifecycle;
- success redirect recovery;
- booking funnel/payment analytics.

Step 4 must be redesigned last and only presentation-first. No RD-P05 slice may alter charge calculation, pending-booking creation, payment confirmation, auth requirements, referral/promo/credit eligibility, or success-state semantics without a separately authorised functional change.

## Current reusable booking UI inventory

Booking V2 already has reusable domain components including:

- `BookingV2Header`
- `BookingV2StepIndicator`
- `BookingV2SummaryPanel`
- `CustomerPriceBreakdown`
- `PropertyAddressSection`
- `EquipmentSection`
- `RoomCountSelector`
- `ServiceQuestionOptionCards`
- `CleanerCountSelector`
- `CleanerPreferenceSection`
- `CleanerCard`
- `TeamAvailabilitySection`
- `TeamCard`
- `TimeSlotPicker`
- `UnsupportedSuburbModal`
- `WhatsIncludedModal`
- `YesNoToggle`
- `YesNoToggleRow`

These should be normalized or composed before creating page-specific duplicates.

## UI debt / redesign opportunity

The booking flow is already responsive and functional, but it still relies heavily on route/domain-local `slate-*`, `blue-*`, border, radius and spacing utilities rather than the semantic global design roles established in RD-P00/RD-P01.

Step 1 contains local field primitives and a bespoke select; Step 2 contains a bespoke calendar and substantial schedule presentation; Steps 3 and 4 are very large components and therefore higher regression risk.

The safest redesign approach is selective normalization of presentation while leaving domain contracts and state ownership untouched.

## Approved implementation order recommendation

### RD-P05B — Booking shell + `/book` hub normalization

First implementation slice. Presentation only:

- normalize `/book` hub surface, typography, cards and quote escape hatch to the global design system;
- normalize `BookingV2Shell` outer surface/container spacing;
- normalize `BookingV2Header`, step indicator, summary chrome and shared Back/Continue button presentation;
- preserve all hrefs, service slugs, catalog pricing, query params, step routing and analytics.

This establishes the booking visual baseline before touching form-field internals.

### RD-P05C — Step 1 Details presentation

Normalize field labels, controls, room selectors, option cards, address, equipment, extras and included-content presentation while preserving React Hook Form names, live questions, show/hide logic, extras IDs, address/service-area resolution and Step 1 validation.

### RD-P05D — Step 2 Schedule presentation

Normalize calendar, booking type, recurring controls, time slots, cleaner/team selection and availability states while preserving scheduling, slot filtering, fulfillment mode and selection contracts.

### RD-P05E — Step 3 Review presentation

Normalize review hierarchy and price summary only. Preserve booking draft/persistence and all review-to-payment state.

### RD-P05F — Step 4 Payment presentation

Presentation-only last slice. Preserve auth, promo/referral/credit, pending booking, Paystack, success redirect and payment analytics exactly.

### RD-P05G — Booking UI closure audit

Desktop/mobile/accessibility regression pass across all six service flows, resumability, referral/promo parameter retention and step transitions, without completing a real payment unless separately authorised.

## Validation strategy

Each implementation slice should require:

- `npm --prefix apps/web run typecheck`;
- targeted unit tests for any touched shared booking helper/component where appropriate;
- local `/book` + one representative service desktop/mobile visual smoke;
- later service-specific smoke across all six flows;
- no real payment completion and no production data mutation.

## RD-P05A decision

RD-P05A is COMPLETE and READY FOR IMPLEMENTATION.

Recommended next slice: **RD-P05B — Booking shell + `/book` hub normalization**.
