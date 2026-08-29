# SR-11E — Office SLA breaches shared chrome convergence

## Finding

`/office/sla-breaches` still rebuilt the same page title/subtitle and Refresh control already standardized by `OfficeZohoChrome`.

The page is a safer next SR-11 slice than `/office/customers` because it is primarily read-oriented and does not carry customer delete/export actions in the header being changed.

## Change

- Replaced the local SLA Breaches title/subtitle wrapper with `OfficeZohoPageHeader`.
- Replaced the local Refresh button with `OfficeZohoSecondaryButton`.
- Kept the priority-red `Assign all unassigned` navigation CTA as a Link so its urgency treatment is preserved rather than forcing the generic shared primary-button treatment.

## Behavior preserved

- `/api/admin/bookings` remains the data source with `filter: "sla"`.
- Refresh still calls `refetch()`.
- SLA severity, overdue calculations, counts, filters, search and error retry behavior are unchanged.
- `Assign all unassigned` still navigates to `/office/bookings`.
- Per-booking `Assign now` links remain unchanged.
- No permission, role, database, payment, notification or production behavior is changed.

## Regression protection

`sr11eOfficeSlaBreachesSharedChromeContract.test.ts` statically verifies the shared header/button adoption while retaining the SLA API/filter, refresh behavior and assignment navigation.

## Status

Implemented; CI required before merge into `integration/shalean-repairs`.
