# SR-12B — Office denied-gate focus convergence

## Scope

This isolated convergence slice verifies the existing denied-gate keyboard-focus treatment in `apps/web/src/features/office/OfficeShell.tsx` on the current release line.

## Current-state finding

The current shell already satisfies SR-12B. Its shared `actionClass` gives the retry and account-switch actions a visible focus ring, while the primary login action independently provides the same focus-visible treatment. Reapplying the historical implementation would duplicate styling and regress current design-token convergence.

## Convergence action

- Preserve the existing runtime implementation unchanged.
- Add executable regression coverage for all three denied-gate actions.
- Lock retry and encoded-login redirect behaviour.
- Confirm SR-12A retains its immediate polite loading announcement without a deferred busy state.

## Preserved behaviour

No changes are made to authentication, authorization, retry handling, redirects, Supabase sessions, design tokens, navigation, realtime behaviour, bookings, payments, permissions, or production data.

## Regression evidence

`apps/web/src/features/office/__tests__/sr12bOfficeDeniedGateFocusContract.test.ts` is discovered by the normal Vitest configuration introduced with SR-12A.

## Decision

**SR-12B — Converged by executable verification / pull request pending.**

SR-12C and SR-12D remain outside this branch.
