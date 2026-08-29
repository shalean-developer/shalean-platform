# SR-11I — Shared Office select/dropdown

## Scope

Introduce the first shared Office select control and adopt it on the read-only Cleaner Performance page only.

## Audit finding

`/office/cleaner-performance` still hand-built its 30/90/180/365-day period `<select>` after its page header had already converged on shared Office chrome.

This is a smaller and safer next SR-11 slice than adopting pagination on Cleaner Reports & Feedback because Cleaner Performance is read-only and the selected period only changes the scorecard query window.

## Change

- Added `OfficeZohoSelect` under `components/admin/office`.
- Centralized Office select border, typography, focus-visible ring and disabled-state styling.
- Replaced only the Cleaner Performance period selector with the shared component.

## Behavior preserved

- Initial period remains 90 days.
- Options remain exactly 30, 90, 180 and 365 days.
- `setDays(Number(e.target.value))` remains the change behavior.
- API remains `/api/admin/cleaner-performance?days=${days}`.
- Score calculations, grades, evidence coverage, quality cases, table rendering, Refresh behavior and read-only semantics are unchanged.

## Accessibility/interaction improvement

The shared select includes a consistent keyboard focus ring and disabled-state treatment while preserving the existing `aria-label="Scorecard period"`.

## Evidence

Static contract: `apps/web/components/admin/office/__tests__/sr11iOfficeSharedSelectContract.test.ts`.

## Safety

No production data mutation, migration, deployment, payment action or notification send. Targets `integration/shalean-repairs` only.
