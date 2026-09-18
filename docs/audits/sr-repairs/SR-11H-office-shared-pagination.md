# SR-11H — Shared Office pagination

## Scope

Continue SR-11 beyond page-header convergence by extracting one verified duplicated pagination pattern into shared Office chrome.

Chosen first adopter: `/office/conversion`.

Why this page first:
- it is read-only analytics;
- it already has stable client-side paging behavior;
- `/office/cleaner-report-feedback` has a materially similar pagination pattern, but also contains write/manage behavior, so it is deferred to a separate slice.

## Change

Added `OfficeZohoPagination` to `apps/web/components/admin/office/OfficeZohoChrome.tsx`.

The shared control owns only presentation/interaction chrome:
- page-size selector;
- page indicator;
- Prev / Next buttons;
- lower/upper page clamping;
- disabled states;
- focus-visible ring behavior;
- `aria-label` for the pagination group;
- `aria-live` for page position feedback.

`/office/conversion` now uses the shared component instead of rebuilding those controls locally.

## Preserved behavior

No conversion data or business logic changed:
- `/api/admin/seo-attribution` remains the data source;
- page sizes remain 10 / 15 / 25 / 50;
- changing page size still resets to page 1;
- search still resets to page 1;
- page rows are still calculated from `safePage` and `pageSize`;
- landing attribution, conversion metrics, direct-booking grouping and daily funnel activity are unchanged.

## Verification

Static regression contract:
`apps/web/components/admin/office/__tests__/sr11hOfficeSharedPaginationContract.test.ts`

The contract verifies:
- the shared pagination component exists;
- accessibility/focus/disabled-state behavior is present;
- Conversion consumes the shared control;
- its existing API and paging calculations remain intact;
- the old local Chevron Prev/Next implementation is removed from Conversion.

## Risk / authority

Presentation and shared interaction component only.

No production data mutation, migration, deployment, payment action, notification send or customer-facing booking behavior change is authorised or performed.

Target remains `integration/shalean-repairs`.
