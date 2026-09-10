# SR-11J — Office cleaner performance shared table shell

## Scope

Adopt the existing shared `OfficeZohoTableShell` on the read-only `/office/cleaner-performance` scorecard table.

## Why this slice

SR-11 already has shared page chrome, pagination and select/dropdown work. Cleaner Performance is a low-risk next adopter because its table is read-only and contains no finance amount/customer-revenue column, so the table shell's customer-revenue visibility behavior is inert on this page.

## Changes

- Wrapped the existing Cleaner scorecards table/loading/empty-state container in `OfficeZohoTableShell`.
- Removed the page-local outer table shell styling in favor of the shared Office table container.
- Preserved the table headers, row content, loading/empty states, score calculations, period selector and Refresh behavior.
- Preserved `/api/admin/cleaner-performance?days=${days}` unchanged.

## Explicit non-changes

- No score, grade, complaint or evidence logic changes.
- No API, permission, payment, notification, migration or production-data changes.
- No finance amount/customer-revenue header was introduced.

## Regression contract

`apps/web/components/admin/office/__tests__/sr11jOfficeCleanerPerformanceTableShellContract.test.ts`

The contract verifies shared table-shell adoption, preservation of scorecard table headers/API behavior, and absence of finance amount/customer-revenue headers on this read-only table.

## Status

Implemented on `repair/sr-11j-office-cleaner-performance-table-shell`; CI pending.
