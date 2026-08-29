# SR-12A — Office first-paint loading accessibility

## Scope

First controlled slice of **SR-12 — P1 Accessibility / first-paint fixes**.

Target:
- `apps/web/src/features/office/OfficeShell.tsx`

## Verified defect

`OfficeSkeleton` provided a visible first-paint skeleton during role checking and timeout recovery, but it had no accessible loading announcement. Its pulse blocks were also exposed as ordinary DOM to assistive technology despite being purely decorative.

## Repair

- Added `role="status"` to the loading container.
- Added `aria-live="polite"` and `aria-busy="true"`.
- Added an `sr-only` loading message: `Loading Office workspace…`.
- Marked the visual top-bar and body skeleton groups `aria-hidden="true"` so decorative pulse blocks are ignored by assistive technology.

## Preserved behavior

No change to:
- admin role checking;
- timeout retry behavior;
- Supabase/session logic;
- Office shell layout dimensions;
- sidebar/mobile drawer behavior;
- command palette;
- realtime booking subscription;
- navigation or logout behavior;
- production data, permissions, payments, bookings or notifications.

Both `checking` and `timeout` states continue to reuse `OfficeSkeleton`.

## Regression evidence

Static contract:
- `apps/web/src/features/office/__tests__/sr12aOfficeFirstPaintLoadingA11yContract.test.ts`

The contract locks the accessible status/busy semantics, hidden decorative skeleton groups, and reuse by both first-paint states.

## Decision

**SR-12A — Implemented / CI pending.**

SR-12 remains in progress after this slice. Subsequent slices should continue with the next smallest verified accessibility or first-paint defect rather than broad redesign work.
