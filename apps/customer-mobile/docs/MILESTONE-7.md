# Milestone 7 — Bookings management

## What shipped

- Customer bookings **list** (Upcoming / Past) with pull-to-refresh
- Booking **detail** with summary + cancel / reschedule / rebook actions
- **Reschedule** screen (21-day chips + morning slots → `PATCH` date/time)
- **Recurring plans** list with pause / resume / skip / cancel
- Home next/recent cards deep-link to `/bookings/[id]`
- Rebook into book wizard via `?rebook={id}` (prefills details, lands on schedule)
- Eligibility gated by `@shalean/types` + `started_at` / `en_route_at` / monthly cross-month rules
- `@shalean/api-client`: `createCustomerRecurringApi`, optional `createRebookApi`

## Screens

| Route | Role |
|-------|------|
| `/(tabs)/bookings` | Upcoming / Past list + link to recurring |
| `/bookings/[id]` | Detail, cancel confirm, actions |
| `/bookings/[id]/reschedule` | Date/time pick → PATCH |
| `/bookings/recurring` | Plans list + plan actions |

Track CTA → Milestone 8 (`/bookings/[id]/track`).

## APIs used

- `GET /api/customer/bookings`
- `GET /api/customer/bookings/:id`
- `POST /api/customer/bookings/:id/cancel`
- `PATCH /api/customer/bookings/:id/reschedule`
- `GET /api/me/recurring`
- `POST /api/me/recurring/:id/{pause\|resume\|skip\|cancel}`
- Optional: `GET /api/rebook/prefill` (signed deep links; signed-in uses bookings.get)

## Eligibility

`lib/bookings/modifyEligibility.ts`:

- `canCancelBooking` — cancellable status + `!started_at`
- `canRescheduleBooking` — reschedulable status + `!started_at` + `!en_route_at`
- `canRebookBooking` — completed or cancelled (canonical)
- `isRescheduleCrossMonthBlocked` — monthly-linked YYYY-MM guard

## Contract tests

```bash
cd apps/customer-mobile
npm run test:bookings
```

## Manual QA

- [ ] Bookings tab lists Upcoming / Past; pull-to-refresh works
- [ ] Tap row → detail with status, when, where, cleaner, price
- [ ] Cancel only when eligible; confirm Alert; list/detail refresh
- [ ] Reschedule opens chips + slots; cross-month monthly blocked; success returns to detail
- [ ] Rebook from completed/cancelled → wizard schedule with address/details prefilled
- [ ] Recurring: pause / resume / skip / cancel with confirms; list refreshes
- [ ] Home next/recent open `/bookings/[id]`
- [ ] `npm run typecheck` and `npm run test:bookings` pass

## Not in this milestone

- Live tracking (done in M8)
- Invoice pay deep links (M9)
- New backend routes (except M8 track DTO)
