# SR-12D — Office mobile dialog Escape dismissal convergence

## Scope

This isolated convergence slice adds keyboard dismissal to the canonical Office mobile navigation drawer in `apps/web/src/features/office/OfficeShell.tsx`.

## Current-state finding

The release shell already provided modal semantics, an accessible name, backdrop and sidebar close paths, and pathname-change dismissal. It did not close the mobile drawer when a keyboard user pressed Escape. The historical SR-12D branch contains the required behavior but diverges substantially from the release line and is not safe to merge wholesale.

## Convergence action

- Listen for `keydown` only while the mobile drawer is open.
- Prevent the default Escape action and close the drawer when `Escape` is pressed.
- Remove the listener when the drawer closes or the effect is cleaned up.
- Suspend drawer Escape handling while the command palette is the topmost dialog, so one keypress dismisses only that palette.
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

- SR-12A through SR-12D targeted contracts: 4 files, 10 tests.
- Enforced Admin RBAC Priority 2 matrix: 9 files, 45 tests.
- Production dependency audit, critical suite, privileged Office security contracts, revenue-path suite, marketing/Meta suite and booking-core lint.
- TypeScript typecheck and the CI-equivalent Next.js Webpack production build.
- Static blog-route, internal-link, SEO-governance and canonical-purity checks; live SEO and Search Console readiness checks.

The complete GitHub exact-head workflow must rerun against every repaired pull-request head.

Final review found that the first convergence head could close the command palette and its underlying mobile drawer with the same Escape event. The repaired handler now remains inactive while `commandOpen` is true, preserving topmost-dialog dismissal. The strengthened contract explicitly locks this coordination.

## Decision

**SR-12D — Review finding repaired and locally validated / repaired-head workflow pending.**
