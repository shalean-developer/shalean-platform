# SR-11A — Office Analytics shared chrome convergence

Status: In Progress — pending CI/review

## Scope

SR-11 begins the controlled consolidation of duplicated Office shell/chrome/components. This first slice is deliberately presentation-only and limited to `/office/analytics`.

## Audit finding

The main Office route already has a canonical shared layout and shell through `apps/web/app/(ui-redesign)/office/layout.tsx` and `apps/web/src/features/office/OfficeShell.tsx`.

A smaller remaining duplication exists at page level: `/office/bookings` already uses shared components from `OfficeZohoChrome`, including `OfficeZohoPageHeader` and `OfficeZohoSecondaryButton`, while `/office/analytics` rebuilt the same title/subtitle/actions structure and refresh button locally.

## Repair

`/office/analytics` now uses:

- `OfficeZohoPageHeader` for the page title, subtitle and action slot;
- `OfficeZohoSecondaryButton` for Refresh;
- the existing `AnalyticsDateRangePicker` unchanged inside the shared action slot.

The fetched-at timestamp remains visible in the subtitle.

## Behavior preserved

No changes were made to:

- `/api/admin/office-analytics` requests;
- date-range state or query parameters;
- refresh/refetch behavior;
- loading and error behavior;
- KPI calculations;
- charts or booking/service trend data;
- authentication, Office permissions or role gates;
- production data, migrations, deployments or notifications.

## Regression evidence

`apps/web/components/admin/office/__tests__/sr11aOfficeSharedChromeContract.test.ts` guards that Analytics uses the shared header/button, no longer recreates the previous local H1 header, and still retains refresh/date-range/API behavior.

## Next decision

After green CI and merge, continue SR-11 with the next smallest verified Office chrome/component duplication. Do not bulk-normalize every Office page in one change.
