# RD-P05D — Step 2 Schedule normalization

Status: IMPLEMENTED — LOCAL VALIDATION PENDING
Branch: `design/rd04-platform-redesign`
Scope: presentation-only normalization of Booking V2 Step 2. No production deployment or data mutation.

## Authority preserved

RD-P05D does not modify:

- `Step2Schedule.tsx` date rules, booking-type state, recurring-frequency/day behavior or React Hook Form registrations;
- `useBookingV2ScheduleAvailability` live availability requests, fulfillment mode, slot filtering or service-area requirements;
- `TimeSlotPicker` time-window eligibility and availability behavior;
- cleaner count, cleaner preference, selected-cleaner replacement/trimming or re-sync behavior;
- deep/moving team availability or assigned-team state;
- pricing/duration inputs used for schedule availability;
- `BookingV2Context` draft persistence, URL step state, rebook/prefill behavior, pricing, referral/promo/credit, confirmation or Paystack behavior.

## Implementation

RD-P05D extends the shared shell CSS module with a Step-2-only presentation scope rather than editing the schedule components.

### `BookingV2Shell.module.css`

The Step 2 scope:

- removes redundant outer Step 2 card chrome so the schedule sections become the visual hierarchy;
- turns direct Step 2 sections into semantic card surfaces using approved border, radius, card and shadow tokens;
- removes redundant divider rules between schedule cards;
- normalizes Step 2 foreground/muted text and date/select input surfaces to semantic tokens;
- preserves date/time subcards while normalizing their border/background presentation;
- preserves 44px minimum form-control height and adds consistent focus-visible treatment;
- keeps compact mobile padding and increases section padding from `sm` upward.

Commit: `f42108b9` — `RD-P05D: add Step 2 presentation scope`

### `BookingV2Shell.tsx`

The shared shell applies the Step 2 presentation class only when `currentStep === 2`.

No schedule handler, Step 1/3/4 rendering condition, navigation callback, summary condition, provider, pricing hook or telemetry hook changed.

Commit: `66572994` — `RD-P05D: scope Step 2 presentation normalization`

## Diff-scope verification

Comparison from RD-P05C closure head `56a05219` to the RD-P05D implementation head shows exactly two files changed:

1. `apps/web/src/features/booking-v2/BookingV2Shell.module.css` — Step-2-only presentation styles;
2. `apps/web/src/features/booking-v2/BookingV2Shell.tsx` — one conditional Step 2 CSS-module class.

`Step2Schedule`, availability hooks, `TimeSlotPicker`, cleaner/team selectors and all business-logic files are unchanged.

## Local validation gate

Before RD-P05D can close:

1. pull the latest branch and run `npm --prefix apps/web run typecheck`;
2. confirm `/book/regular-cleaning?step=2` or an equivalent saved Step 2 flow returns `200`;
3. desktop + mobile smoke regular-cleaning Step 2 for booking type, calendar, time slots, cleaner count/preference, summary and Back/Continue navigation;
4. toggle Once-off / Recurring and verify recurring frequency/day/date controls remain usable without completing a booking;
5. if practical, smoke one team-mode service such as deep or moving cleaning and confirm team availability presentation still renders;
6. do not create a booking, complete payment, mutate production data or deploy production.

If these pass, mark RD-P05D `PASSED / CLOSED` and proceed to RD-P05E — Step 3 Review normalization.

## Authority boundary

No production deployment, Vercel configuration change, Supabase data/schema mutation, booking creation, payment completion or production customer traffic is authorized by RD-P05D.
