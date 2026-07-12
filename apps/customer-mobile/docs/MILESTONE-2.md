# Milestone 2 — Shared packages

## What shipped

- `packages/mobile-ui` — shared RN UI kit + design tokens
- Cleaner app re-exports UI via thin shims; `OfflineBanner` stays local
- `@shalean/api-client` domain factories: health, customer bookings, booking-v2, dashboard, referrals/promotions
- `@shalean/utils/customerSupport` — shared support contacts (web shim preserves env override)
- Customer app wires `mobile-ui`, domain APIs, support constants

## Not in this milestone

- Authentication (Milestone 3)
- Product booking / payment screens
