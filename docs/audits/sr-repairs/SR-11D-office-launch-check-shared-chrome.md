# SR-11D — Office Launch readiness shared chrome convergence

Status: In Progress — pending CI/review

## Scope

Continue SR-11 with the next smallest verified page-level Office chrome duplication. This slice is presentation-only and limited to `/office/launch-check`.

## Audit finding

`/office/launch-check` rebuilt its page title/subtitle and `Run checklist` action locally, while the shared `OfficeZohoChrome` components are already the canonical pattern for Office page headers and secondary actions.

The larger `/office/customers` page also contains this duplication, but it carries more unrelated CRUD and export surface. Launch readiness was therefore chosen first as the smaller-risk SR-11D slice.

## Repair

`/office/launch-check` now uses:

- `OfficeZohoPageHeader` for the page title, subtitle and action slot;
- `OfficeZohoSecondaryButton` for `Run checklist`.

## Behavior preserved

No changes were made to:

- GET `/api/admin/launch-check` status loading;
- POST `/api/admin/launch-check` checklist execution;
- configuration gating through `status.configReady`;
- loading/error/result state;
- automatic refetch after a successful checklist run;
- check expansion/details;
- test identity display;
- placeholder count display;
- Office authentication, role gates or permissions;
- production data, migrations, deployments, payments or notifications.

## Regression evidence

`apps/web/components/admin/office/__tests__/sr11dOfficeLaunchCheckSharedChromeContract.test.ts` guards shared header/button usage and preserves the launch-check GET/POST, config-ready gating, run action and refetch behavior.

## Next decision

After green CI and merge, continue SR-11 with the next smallest verified Office component duplication rather than bulk-normalizing the whole Office surface.
