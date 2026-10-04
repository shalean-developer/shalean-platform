# SR-11G — Office conversion shared chrome

## Scope
Presentation-only convergence of `/office/conversion` onto the canonical shared Office page chrome.

## Verified duplication
The page manually rebuilt its title, subtitle, and Refresh action even though `OfficeZohoPageHeader` and `OfficeZohoSecondaryButton` already provide the canonical Office pattern.

## Change
- Replaced the local title/subtitle wrapper with `OfficeZohoPageHeader`.
- Replaced the local Refresh button with `OfficeZohoSecondaryButton`.

## Preserved behavior
- `/api/admin/seo-attribution` data source.
- `seo.refetch()` refresh behavior.
- Session/start/completion conversion summaries.
- Landing-page attribution labels and direct-booking grouping.
- Search behavior.
- Page-size choices and client-side pagination.
- Last-seven-day funnel activity bars.
- Loading and error handling.

## Safety
No production data mutation, migration, deployment, payment action, notification send, or write API behavior is introduced by this slice.

## Status
Implemented on `repair/sr-11g-office-conversion-shared-chrome`; CI required before merge to `integration/shalean-repairs`.
