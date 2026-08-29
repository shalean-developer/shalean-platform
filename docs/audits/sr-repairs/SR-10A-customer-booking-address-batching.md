# SR-10A — Customer booking saved-address batching

Status: **In review**

Audit base: `integration/shalean-repairs` at `3f4f4f511a2421c92b753f416d2f293bb5aa03ec`.

## Concrete defect

The canonical customer booking loader can return up to 500 booking rows. When a booking is missing its persisted `location`, the loader previously queried `customer_saved_addresses` once per booking row. That creates an N+1 query pattern and makes query cost grow linearly with the number of bookings returned.

## Repair

- Collect booking rows that actually need saved-address fallback enrichment.
- Derive the unique owner ids and suburbs from those rows.
- Query matching saved addresses once with bounded `IN (...)` filters.
- Index the returned addresses in memory by owner + suburb.
- Preserve the existing nearest-created-address heuristic and fallback to the newest matching saved address.
- Preserve the single-booking detail fallback path.
- Add an SR-10 regression contract that prevents re-introducing the per-booking saved-address query loop.

## Deliberately deferred

The existing `CUSTOMER_BOOKINGS_LIST_LIMIT = 500` remains unchanged in SR-10A. Replacing that compatibility cap with real server-side pagination requires the API response and customer account consumers to move together so older bookings do not silently disappear. That should be handled as the next isolated SR-10 pagination sub-slice.

## Safety

No production data mutation, migration, deployment, payment action, notification send or `main` merge is authorised by this slice. The pull request targets `integration/shalean-repairs` only.
