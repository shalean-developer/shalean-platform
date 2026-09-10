# SR-12A — Office first-paint loading accessibility convergence

## Scope

This isolated convergence slice targets `apps/web/src/features/office/OfficeShell.tsx` on the current `integration/shalean-release` line.

## Verified defect

`OfficeSkeleton` displayed a loading state during role checking and timeout recovery without announcing that state to assistive technology. Its animated visual blocks were also exposed despite being decorative.

## Repair

- Expose the loading container as a polite, busy status region.
- Provide the screen-reader message `Loading Office workspace…`.
- Hide the decorative top-bar and body skeleton groups from assistive technology.
- Add the Office feature-test directory to the normal Vitest discovery set.

## Preserved behaviour

The current design tokens, shell dimensions, authentication and retry flow, Supabase session handling, navigation, mobile drawer, command palette, realtime booking subscription, and logout behaviour remain unchanged.

No database, permission, payment, booking-state, production-data, or deployment change is included.

## Regression evidence

`apps/web/src/features/office/__tests__/sr12aOfficeFirstPaintLoadingA11yContract.test.ts` verifies the status announcement, hidden decorative groups, and reuse of the same skeleton for checking and timeout states.

## Decision

**SR-12A — Implemented / pull request pending.**

SR-12B, SR-12C, and SR-12D remain outside this branch.
