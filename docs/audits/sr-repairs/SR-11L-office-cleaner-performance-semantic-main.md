# SR-11L — Office cleaner performance semantic main cleanup

## Scope
Presentation/semantics-only cleanup for `/office/cleaner-performance` under **SR-11 — Shared Office shell/components**.

## Verified duplication/problem
`OfficeShell` already renders the canonical Office `<main>` landmark around every Office page. Cleaner Performance also rendered its own `<main className="space-y-6">`, creating a nested main landmark.

## Change
Replace only the Cleaner Performance page-level `<main>` wrapper with a `<div>` while preserving the same `space-y-6` class.

## Preserved contracts
- `/api/admin/cleaner-performance?days=${days}`
- 30/90/180/365-day period selection
- score calculations and grade values
- evidence coverage and quality-case calculations
- shared status badge
- shared table shell
- Refresh/refetch behavior
- table headers and row rendering
- all visual spacing on the page wrapper

## Acceptance evidence
Static regression contract: `apps/web/components/admin/office/__tests__/sr11lOfficeCleanerPerformanceSemanticMainContract.test.ts`.

The contract verifies that `OfficeShell` retains the canonical `<main>`, Cleaner Performance no longer introduces a nested main landmark, and its key behavior/component contracts remain present.

## Excluded
No production data mutation, migration, deployment, payment action, notification send, permission change, score calculation change, or broader accessibility redesign.
