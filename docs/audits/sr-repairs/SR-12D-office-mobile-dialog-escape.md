# SR-12D — Office mobile dialog Escape dismissal convergence

## Scope

This isolated convergence slice adds keyboard dismissal to the canonical Office mobile navigation drawer in `apps/web/src/features/office/OfficeShell.tsx`.

## Current-state finding

The release shell already provided modal semantics, an accessible name, backdrop and sidebar close paths, and pathname-change dismissal. It did not close the mobile drawer when a keyboard user pressed Escape. The historical SR-12D branch contains the required behavior but diverges substantially from the release line and is not safe to merge wholesale.

## Convergence action

- Listen for `keydown` only while the mobile drawer is open.
- Prevent the default Escape action and close the drawer when `Escape` is pressed.
- Remove the listener when the drawer closes or the effect is cleaned up.
- Add executable regression coverage in the current Office test location.
- Invoke the SR-12D contract explicitly in the required Admin RBAC Priority 2 workflow.

## Preserved behavior

The existing named modal, close-menu button, sidebar close path, pathname-change dismissal, authentication, authorization, role gates, retry handling, redirects, Supabase sessions, navigation structure, design tokens, desktop navigation, command palette, logout and realtime behavior remain unchanged. SR-11 and SR-12A through SR-12C contracts remain unchanged.

## Explicit exclusions

- No focus-trap or focus-return redesign.
- No navigation or visual redesign.
- No database migration or production-data mutation.
- No production deployment.

## Regression evidence

`apps/web/src/features/office/__tests__/sr12dOfficeMobileDialogEscapeContract.test.ts` is invoked explicitly by `.github/workflows/admin-rbac-priority2.yml`.

Local validation from the isolated convergence worktree passed:

- SR-12A through SR-12D targeted contracts: 4 files, 9 tests.
- Enforced Admin RBAC Priority 2 matrix: 9 files, 44 tests.
- Production dependency audit, critical suite, privileged Office security contracts, revenue-path suite, marketing/Meta suite and booking-core lint.
- TypeScript typecheck and the CI-equivalent Next.js Webpack production build.
- Static blog-route, internal-link, SEO-governance and canonical-purity checks; live SEO and Search Console readiness checks.

The complete GitHub exact-head workflow remains a pull-request gate and must run after separate approval to open the convergence pull request.

## Decision

**SR-12D — Implemented and locally validated / exact-head pull-request workflow pending.**
