# SR-10B — Customer booking server pagination

Status: **In Progress pending CI/review**

Base: `integration/shalean-repairs` after merged SR-10A / PR #443.

## Concrete defect

The customer account fetched the canonical customer bookings list in one request. The server-side loader could query hundreds of bookings, while `/account/bookings` only paginated the already-loaded array five rows at a time. That UI pagination did not reduce database/query cost and could prevent a safe transition away from the historical 500-row cap.

## Repair

- Added a bounded server-side customer booking page loader.
- Default API page size is 25; hard maximum is 50.
- Added an opaque cursor based on stable descending `(created_at, id)` ordering.
- Each ownership source fetches only `limit + 1` rows to determine whether another page exists.
- Preserved canonical customer ownership plus legacy email-orphan compatibility.
- Preserved pending-payment visibility and continued excluding only `payment_expired` from the list.
- Preserved batched saved-address enrichment from SR-10A and applies enrichment only to the returned page.
- `/api/customer/bookings` now returns `{ bookings, pageInfo: { hasMore, nextCursor } }`.
- `useBookings` consumes `pageInfo`, requests older pages by cursor and deduplicates appended rows by booking id.
- `/account/bookings` keeps the existing card/table and five-row presentation pagination, while exposing **Load older bookings** when the server reports another page.
- Explicit legacy booking-ownership claiming remains in place before account list reads.

## Safety / scope

No production data mutation, migration, deployment, payment action or notification send is included. The change targets `integration/shalean-repairs` only and does not authorize a merge to `main`.

## Acceptance evidence

Focused SR-10B regression coverage checks page-size bounds, cursor round-trip/validation, stable query ordering, pending-payment visibility, API `pageInfo`, progressive consumer loading/deduplication and preservation of ownership claiming.

## Next decision

If CI passes and the SR-10B PR is reviewed/merged into `integration/shalean-repairs`, continue the SR-10 audit for the next concrete pagination/query-cost defect rather than broad performance refactoring without evidence.
