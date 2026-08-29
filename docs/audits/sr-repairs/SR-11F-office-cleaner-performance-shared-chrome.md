# SR-11F — Office cleaner performance shared chrome

## Scope
Presentation-only convergence of `/office/cleaner-performance` onto the shared Office page chrome.

## Verified duplication
The page locally rebuilt:
- page title/subtitle chrome;
- Refresh button chrome.

The page is a lower-risk next slice than `/office/customers` because it is read-only and does not contain customer delete/export mutations.

## Repair
- Replaced the local page header with `OfficeZohoPageHeader`.
- Replaced the local Refresh button with `OfficeZohoSecondaryButton`.
- Kept the 30/90/180/365-day selector in the shared header actions slot.
- Preserved the workforce-quality context in the shared subtitle.

## Preserved behavior
- `/api/admin/cleaner-performance?days=${days}` data loading;
- period changes;
- manual refetch;
- score calculations and grade logic;
- evidence and quality-case presentation;
- cleaner scorecard table;
- read-only earnings/payout exclusion semantics.

## Exclusions
No production data mutation, migration, deployment, payment action, notification send, customer deletion/export change, or broad Office redesign.

## Verification
Static regression contract: `apps/web/components/admin/office/__tests__/sr11fOfficeCleanerPerformanceSharedChromeContract.test.ts`.
