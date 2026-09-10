# SR-11B — Office Operations shared chrome convergence

Status: In Progress — pending CI/review

## Scope

Continue SR-11 with the next smallest verified page-level Office chrome duplication. This slice is presentation-only and limited to `/office/operations`.

## Audit finding

`/office/operations` still rebuilt its page title, subtitle and Refresh button locally even though the Office area already has shared page chrome in `OfficeZohoChrome` and SR-11A established the same convergence pattern for Analytics.

## Repair

`/office/operations` now uses:

- `OfficeZohoPageHeader` for the Operations title, subtitle and action slot;
- `OfficeZohoSecondaryButton` for Refresh.

## Behavior preserved

No changes were made to:

- `/api/admin/office-operations` requests;
- refresh/refetch behavior;
- KPI values;
- open-issue derivation/display;
- supply-vs-demand calculations;
- issue/schedule links;
- loading or error behavior;
- authentication, Office permissions or role gates;
- production data, migrations, deployments, payments or notifications.

## Regression evidence

`apps/web/components/admin/office/__tests__/sr11bOfficeOperationsSharedChromeContract.test.ts` verifies that Operations uses the shared header/button, does not recreate the previous local H1 header, and retains the existing refresh/API/issues/supply-demand contract.

## Next decision

After green CI and merge, continue SR-11 with the next smallest verified Office shared-component duplication. Avoid bulk-normalizing unrelated Office pages in one PR.
