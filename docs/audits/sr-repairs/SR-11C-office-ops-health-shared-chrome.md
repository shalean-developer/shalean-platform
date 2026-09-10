# SR-11C — Office Ops Health shared chrome convergence

Status: In Progress — pending CI/review

## Scope

Continue SR-11 with the next smallest verified Office page-level chrome duplication. This slice is presentation-only and limited to `/office/ops-health`.

## Audit finding

`/office/ops-health` still rebuilt its page title/subtitle and Refresh all action locally, while `OfficeZohoChrome` is already the shared pattern used by earlier SR-11 slices.

## Repair

`/office/ops-health` now uses:

- `OfficeZohoPageHeader` for the title, subtitle and action slot;
- `OfficeZohoSecondaryButton` for `Refresh all`;
- the existing issue-breakdown information retained in the header subtitle when issues exist.

## Behavior preserved

No changes were made to:

- `/api/admin/office-ops-health` requests;
- acknowledged-issue filtering;
- refresh/refetch behavior;
- service status calculations;
- uptime/status cards;
- scanner panel behavior;
- service scrolling;
- authentication, Office permissions or role gates;
- production data, migrations, deployments or notifications.

## Regression evidence

`apps/web/components/admin/office/__tests__/sr11cOfficeOpsHealthSharedChromeContract.test.ts` guards shared header/button usage and preserves the Ops Health API, refresh, acknowledged filtering and scanner panel contract.

## Integration hygiene note

Two temporary placeholder commits were accidentally written and then immediately removed from `integration/shalean-repairs` before this repair branch was created. They left no file/content change on the integration tree, but the no-op commit history remains. All actual SR-11C implementation changes are isolated to `repair/sr-11c-office-ops-health-shared-chrome`.

## Next decision

After green CI and merge, continue SR-11 with the next smallest verified duplication rather than bulk-normalizing Office pages.
