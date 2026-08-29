# RD-P05D — Step 2 Schedule normalization

Status: PASSED / CLOSED
Branch: `design/rd04-platform-redesign`
Validation base: `validation/rd-p05d-base` @ `56a052199e9a534d4e7afb0d35875ff7246dbb4e`
Validated closure head: `b602513e048d3e9379ffdc9e85e871608d12f777`
Validation PR: #444 — validation only; closed unmerged.
Scope: presentation-only normalization of Booking V2 Step 2. No production deployment or data mutation.

## Authority preserved

RD-P05D did not modify:

- `Step2Schedule.tsx` date rules, booking-type state, recurring-frequency/day behavior or React Hook Form registrations;
- `useBookingV2ScheduleAvailability` live availability requests, fulfillment mode, slot filtering or service-area requirements;
- `TimeSlotPicker` time-window eligibility and availability behavior;
- cleaner count, cleaner preference, selected-cleaner replacement/trimming or re-sync behavior;
- deep/moving team availability or assigned-team state;
- pricing/duration inputs used for schedule availability;
- `BookingV2Context` draft persistence, URL step state, rebook/prefill behavior, pricing, referral/promo/credit, confirmation or Paystack behavior.

## Implementation

RD-P05D extended the shared shell CSS module with a Step-2-only presentation scope rather than editing schedule components.

### `BookingV2Shell.module.css`

The Step 2 scope:

- removes redundant outer Step 2 card chrome so the schedule sections become the visual hierarchy;
- turns direct Step 2 sections into semantic card surfaces using approved border, radius, card and shadow tokens;
- removes redundant divider rules between schedule cards;
- normalizes Step 2 foreground/muted text and date/select input surfaces to semantic tokens;
- preserves date/time subcards while normalizing their border/background presentation;
- preserves 44px minimum form-control height and adds consistent focus-visible treatment;
- keeps compact mobile padding and increases section padding from `sm` upward.

Implementation commits:

- `f42108b9` — `RD-P05D: add Step 2 presentation scope`
- `66572994` — `RD-P05D: scope Step 2 presentation normalization`

### `BookingV2Shell.tsx`

The shared shell applies the Step 2 presentation class only when `currentStep === 2`.

No schedule handler, Step 1/3/4 rendering condition, navigation callback, summary condition, provider, pricing hook or telemetry hook changed.

## Diff-scope verification

Comparison from RD-P05C closure head `56a052199e9a534d4e7afb0d35875ff7246dbb4e` through the RD-P05D implementation kept runtime scope to:

1. `apps/web/src/features/booking-v2/BookingV2Shell.module.css` — Step-2-only presentation styles;
2. `apps/web/src/features/booking-v2/BookingV2Shell.tsx` — one conditional Step 2 CSS-module class.

`Step2Schedule`, availability hooks, `TimeSlotPicker`, cleaner/team selectors and business-logic files remained unchanged.

## Validation evidence

Validation-only PR #444 was pinned to the RD-P05C closure base and closed without merge after validation.

The exact RD-P05D closure head `b602513e048d3e9379ffdc9e85e871608d12f777` passed:

- `migration-governance`;
- the dedicated `booking-v2-step2-smoke` browser gate;
- the standard web validation gate used by the slice.

The non-mutating Step 2 browser smoke proved:

1. Regular Cleaning can toggle Once-off → Recurring → Once-off → Recurring while preserving form state;
2. weekly frequency and weekday selection persist in the Booking V2 draft;
3. a future date and available time can be selected through the existing scheduling/availability contracts;
4. cleaner count changes still update pricing through existing pricing authority;
5. a preferred cleaner can be selected and persists through Step 2 → Step 3 → browser Back;
6. Back from Step 2 returns to Step 1 with the draft intact;
7. Deep Cleaning team mode can choose a date/time and an available team, then advance to Review;
8. every non-analytics `/api/**` mutation is blocked/recorded and the tests assert that no forbidden mutation was attempted.

No booking was created and no payment was initiated or completed during this validation.

## Closure decision

RD-P05D is **PASSED / CLOSED**.

This status correction was reconciled during RD-P05G because the audit text had remained at its pre-validation “local validation pending” state even though the validation PR and exact-head browser evidence had already closed successfully.

## Authority boundary

No production deployment, Vercel configuration change, Supabase data/schema mutation, booking creation, payment completion or production customer traffic was performed or authorized by RD-P05D.
