# SR-12C — Office mobile dialog accessible name convergence

## Scope

This isolated convergence slice verifies the existing accessible name and open/close behavior of the canonical Office mobile navigation drawer in `apps/web/src/features/office/OfficeShell.tsx`.

## Current-state finding

The current release shell already satisfies SR-12C. The mobile drawer is a modal dialog named `Office navigation`, and its backdrop retains the `Close menu` accessible label. This behavior arrived through the current design-system line, so replaying the historical SR-12C implementation would introduce unrelated and superseded presentation changes.

## Convergence action

- Preserve `OfficeShell.tsx` and runtime behavior unchanged.
- Add executable regression coverage for the dialog role, modal state and accessible name.
- Lock the menu-button open action, backdrop and sidebar close actions, and pathname-change close behavior.
- Invoke the SR-12C contract explicitly in the required Admin RBAC Priority 2 workflow.

## Preserved behavior

No changes are made to authentication, authorization, role gates, retry handling, redirects, Supabase sessions, navigation structure, design tokens, desktop navigation, command palette, logout, realtime behavior, bookings, payments, permissions, database state, or production data. SR-11, SR-12A and SR-12B behavior remains unchanged.

## Regression evidence

`apps/web/src/features/office/__tests__/sr12cOfficeMobileDialogNameContract.test.ts` is invoked explicitly by `.github/workflows/admin-rbac-priority2.yml`.

## Decision

**SR-12C — Converged by executable verification / pull request pending.**

Later SR-12 stages remain outside this branch.
