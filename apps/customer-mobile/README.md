# Shalean Customer Mobile App

Expo app for Shalean customers (`apps/customer-mobile`).

**Source of truth:** [docs/customer-mobile-prd.md](../../docs/customer-mobile-prd.md)

This app is another client of the existing platform:

- APIs: `apps/web` `/api/*`
- Auth: Supabase (Milestone 3)
- Payments: Paystack (Milestone 6)
- Shared packages: `@shalean/api-client`, `@shalean/types`, `@shalean/utils`, `@shalean/validation`

It does **not** share a store listing or EAS project with the Cleaner app (`apps/mobile`).

## Milestone status

| Milestone | Status |
|-----------|--------|
| 1 Project setup | Done |
| 2 Shared packages / `mobile-ui` | Done |
| 3 Authentication | Done |
| 4 Home | Done |
| 5 Booking | **Done** |
| 6 Payments | **Done** |
| 7 Bookings management | **Done** |
| 8 Tracking | **Done** |
| 9 Profile | **Done** |
| 10 Notifications | **Done** |
| 11 Rewards | **Done** |
| 12 Production readiness | **Done** (in-repo; store submit is ops) |

## Identifiers

| Item | Value |
|------|--------|
| Display name | Shalean |
| iOS bundle | `za.co.shalean.customer` |
| Android package | `za.co.shalean.customer` |
| Scheme | `shalean-customer://` |
| Expo slug | `shalean-customer` |

## Setup

```bash
cd apps/customer-mobile
cp .env.example .env   # fill values
npm install
npm run typecheck
npm start
```

### Environment

See `.env.example`. Never commit secrets.

### EAS

Create a **new** Expo project (do not reuse the Cleaner `projectId`):

```bash
cd apps/customer-mobile
npx eas init
```

Then set `EXPO_PUBLIC_EAS_PROJECT_ID` (or paste into `app.config.ts` extra) for OTA.

See also: [RELEASE.md](./docs/RELEASE.md) · [UAT.md](./docs/UAT.md) · [STORE_LISTING.md](./docs/STORE_LISTING.md)

## Manual QA (Milestone 1)

- [ ] `npm run typecheck` passes
- [ ] App boots to bootstrap screen
- [ ] Shared packages show Ready
- [ ] `GET /api/health` returns OK (network permitting)
- [ ] Welcome + tab shell placeholders navigate
- [ ] `apps/web` and `apps/mobile` unchanged by this app’s install

## Architecture rules

- Reuse existing APIs — never invent a second backend
- Display pricing may estimate from live catalog/feesConfig; always trust confirm `payAmountZar`
- Never mark bookings paid locally (Paystack verify + webhook; Milestone 6)
- Extract shared UI to `packages/mobile-ui` (do not copy Cleaner product screens)
