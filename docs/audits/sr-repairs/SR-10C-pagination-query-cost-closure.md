# SR-10C — Pagination/query-cost closure audit

Status: In review

Audit base: `integration/shalean-repairs` at `a35d55e4fbb595fda8a32228a1d65fd64ee32747`

## Scope

Verify that the active customer bookings path no longer carries the original SR-10 exposures:

1. `/api/customer/bookings` loading up to 500 bookings into memory before response.
2. Missing booking addresses triggering one `customer_saved_addresses` query per booking.
3. UI-only pagination that sliced an already-loaded large customer booking list.

No production data mutation, migration, deployment, payment action or notification send is part of this slice.

## Closure findings

### 1. Original 500-row exposure — CLOSED on active API path

The canonical `GET /api/customer/bookings` route now imports and calls `loadCustomerBookingPageForUser`, not the legacy `loadCustomerBookingRowsForUser` list loader.

The active pagination contract is bounded:

- default page size: 25;
- hard maximum page size: 50;
- source queries request `limit + 1` rows to determine `hasMore`;
- cursor ordering is stable on `(created_at DESC, id DESC)`;
- the response returns `pageInfo.hasMore` and `pageInfo.nextCursor`.

Therefore the customer bookings endpoint no longer requires a 500-row fetch to render the account list.

### 2. Saved-address N+1 exposure — CLOSED

The active page loader collects missing-address candidates from the returned page and performs one batched `customer_saved_addresses` lookup using `.in("user_id", ownerIds)` and `.in("suburb", suburbs)`.

There is no per-booking address query loop on the active paginated list path.

### 3. UI-only pagination — CLOSED

`useBookings` now consumes the API cursor contract and appends/deduplicates older pages only when requested. `/account/bookings` retains its five-row cards/table presentation but no longer depends on preloading the customer's complete booking history.

## Remaining bounded query-cost hotspots

These are recorded for visibility but do not block SR-10 closure.

### A. Legacy email-orphan compatibility query — LOW / bounded

When a signed-in customer has a usable email, each page can perform a second bounded bookings query for legacy email-only rows whose canonical ownership id is still null.

Impact is bounded by the same `limit + 1` page size and is required for compatibility recovery. The long-term removal condition is permanent repair of remaining orphan booking ownership so `customer_id` becomes the sole canonical relationship.

### B. Team-roster cleaner-name enrichment — LOW / bounded

For pages containing multi-cleaner bookings, enrichment can perform:

1. one batched `cleaners` lookup for display/lead cleaner ids;
2. one batched `booking_cleaners` lookup for team rosters;
3. a second batched `cleaners` lookup inside `fetchTeamRosterByBookingIds` for roster member names.

This is not N+1 and remains bounded by the maximum page size, but the duplicate cleaners lookup could be consolidated in a later cost-optimisation slice if profiling shows value.

### C. Ownership-column schema probe — LOW / cached

`resolveBookingOwnershipColumn` may probe the booking schema once per server process before caching the resolved ownership column. This is not per booking and is not a pagination blocker.

## Closure decision

SR-10's original customer-booking query-cost defects are closed on the active account path:

- server-side bounded pagination is active;
- older bookings remain progressively reachable;
- saved-address enrichment is batched;
- the active path no longer depends on the 500-row list loader;
- remaining compatibility/enrichment costs are bounded and documented.

**Recommended programme status after CI passes and this audit merges: SR-10 — Completed.**
