# Milestone 8 — Tracking

## What shipped

- Thin track API: `GET /api/customer/bookings/[id]/track` (ownership via same loader as booking detail)
- Privacy: cleaner coordinates only when phase is `travelling` or `active`
- Ownership denied → **404** (same as detail — not distinguished from missing)
- Mobile track screen with Google Maps embed (WebView) + open in Maps
- Polling every 10s while `trackable`
- Deep link: `shalean-customer://track/<bookingId>` → `/bookings/[id]/track`
- Detail **Track cleaner** CTA enabled
- No customer device location permission

## Screens

| Route | Role |
|-------|------|
| `/bookings/[id]/track` | Live tracking UI |
| `/track/[bookingId]` | Deep-link redirect |

## APIs

- `getCustomerBookingsApi().track(id)` → `GET /api/customer/bookings/:id/track`

## Tests

Web (ownership + privacy):

```bash
cd apps/web
npx vitest run lib/customer/__tests__/customerBookingTrack.test.ts
```

Mobile:

```bash
cd apps/customer-mobile
npm run test:track
```

## Manual QA

- [ ] Detail → Track cleaner opens track screen
- [ ] Non-owned booking id → unavailable / 404 copy
- [ ] Before en-route: message that map appears when cleaner is on the way
- [ ] While travelling/active with points: map + Open in Google Maps
- [ ] Pull to refresh updates point
- [ ] Deep link `shalean-customer://track/<id>` lands on track screen
- [ ] No location permission prompt on track screen

## Not in this milestone

- Push notification wiring to track (M10)
- Invoice / profile APIs (M9)
