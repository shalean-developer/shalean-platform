# SR-11K — Shared Office status badge

## Scope

Continue **SR-11 — Shared Office shell/components** with the next smallest verified non-header duplication.

## Audit finding

`/office/cleaner-performance` still rendered its grade pill with page-local badge geometry and color classes. A shared Office status badge did not yet exist.

A second pagination adoption was also available on `/office/cleaner-report-feedback`, but that page contains PATCH/manage actions. Cleaner Performance is read-only, so it is the lower-risk first status-badge adopter.

## Change

- Added `OfficeZohoStatusBadge` under `apps/web/components/admin/office`.
- Added tones: `positive`, `info`, `warn`, `danger`, `neutral`.
- Preserved the existing grade presentation exactly:
  - A → emerald
  - B → blue
  - C → amber
  - D → red
  - Needs evidence → slate
- Replaced only the grade badge on `/office/cleaner-performance`.

## Preserved contracts

- `GET /api/admin/cleaner-performance?days=${days}`
- 30/90/180/365-day period selector and default 90-day period
- score calculations and grade values
- evidence coverage and quality-case calculations
- Refresh behavior
- shared Office table shell
- all table headers and row data
- read-only behavior

## Risk

Low. Presentation-only component extraction and adoption on a read-only Office page. No permissions, payments, notifications, migrations, data writes, or production deployment.

## Verification

Static regression contract:

`apps/web/components/admin/office/__tests__/sr11kOfficeStatusBadgeContract.test.ts`

Status: **Implemented / CI pending**.
