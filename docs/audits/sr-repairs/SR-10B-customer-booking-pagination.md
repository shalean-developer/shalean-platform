# SR-10B — Customer booking server pagination

Status: **Converged onto release candidate; pending CI/review**

Base: `integration/shalean-release` at `0bfa9b41b1a37fbc4a4de979238370d3091c4b14` after merged SR-10A / PR #501.

## Concrete defect

The customer account fetched the canonical customer bookings list in one request. The server-side loader could query hundreds of bookings, while `/account/bookings` only paginated the already-loaded array five rows at a time. That UI pagination did not reduce database/query cost and could prevent a safe transition away from the historical 500-row cap.

## Repair

- Added a bounded server-side customer booking page loader.
- Default API page size is 25; hard maximum is 50.
- Added an opaque cursor based on stable descending `(created_at, id)` ordering.
- Each ownership source fetches only `limit + 1` rows to determine whether another page exists.
- Preserved canonical customer ownership plus legacy email-orphan compatibility.
- Preserved pending-payment visibility and continued excluding only `payment_expired` from the list.
- Reuses the merged SR-10A enrichment helper, preserving exact case-sensitive suburb matching and deterministic saved-address pagination while applying enrichment only to the returned page.
- `/api/customer/bookings` now returns `{ bookings, pageInfo: { hasMore, nextCursor } }`.
- `useBookings` consumes `pageInfo`, requests older pages by cursor and deduplicates appended rows by booking id.
- `/account/bookings` keeps the existing card/table and five-row presentation pagination, while exposing **Load older bookings** when the server reports another page.
- Preserved read-only canonical ownership enforcement and legacy email-orphan visibility without restoring the retired ownership-write endpoint.

## Safety / scope

No production data mutation, migration, deployment, payment action or notification send is included. The isolated convergence branch targets `integration/shalean-release`; this implementation does not authorize a pull request or merge.

## Acceptance evidence

Focused SR-10B regression coverage checks page-size bounds, cursor round-trip/validation, stable query ordering, pending-payment visibility, API `pageInfo`, progressive consumer loading/deduplication and read-only ownership enforcement.

## Next decision

If exact-head CI passes and the convergence PR is separately approved and merged into `integration/shalean-release`, mark SR-10 complete and continue to the next mapped SR stage.
