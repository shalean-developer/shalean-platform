# Dispatch E2E (Gap 4)

Opt-in Playwright coverage for **auto-assign**, **selected-cleaner offers**, and cross-surface **`dashboardLifecycle` / `canonicalLifecycle.dashboardAlignment`** parity.

## Prerequisites

- `E2E_DISPATCH=1`
- Server configured like local dev / staging: Supabase admin, locations with coordinates, dispatch secrets.
- `POST /api/test/create-booking` enabled (non-production or `ENABLE_DISPATCH_LOAD_TEST=true` on production).

## Environment

| Variable | Purpose |
|----------|---------|
| `E2E_DISPATCH` | Set to `1` to un-skip dispatch specs. |
| `E2E_DISPATCH_LOAD_TEST_SECRET` | Same value as server `DISPATCH_LOAD_TEST_SECRET` — sent as `x-dispatch-load-test-secret`. |
| `E2E_CUSTOMER_SUPABASE_JWT` | Customer session JWT (`Authorization: Bearer` for `/api/customer/bookings`). `sub` must match `linkUserId` seeded by the harness. |
| `E2E_CLEANER_SUPABASE_JWT` | Cleaner session JWT for `/api/cleaner/dashboard` and offer accept. For **full cleaner assertions**, this account must be the cleaner dispatch assigns (single-cleaner dev DB, or luck). Selected-cleaner scenario uses `E2E_DISPATCH_SELECTED_CLEANER_ID` instead. |
| `E2E_ADMIN_SUPABASE_JWT` | Admin Supabase JWT (`isAdmin` email) for `/api/admin/bookings/:id`. |
| `E2E_DISPATCH_SELECTED_CLEANER_ID` | Required for `selected-cleaner-offer.spec.ts` — must equal `cleaners.id` for `E2E_CLEANER_SUPABASE_JWT`. |
| `PLAYWRIGHT_BASE_URL` | Target app (see root `e2e/README.md`). |

### Test route body extensions (`/api/test/create-booking`)

When the load-test secret is valid, JSON may include:

- `linkUserId`, `customerEmail` — links the row for customer API visibility.
- `dispatchVariant`: `"auto"` (default) or `"user_selected_offer"` — latter inserts `pending_assignment` + one `dispatch_offers` row (skips smart-assign pool).

## Run

```bash
cd apps/web
set E2E_DISPATCH=1
set E2E_DISPATCH_LOAD_TEST_SECRET=***
set E2E_CUSTOMER_SUPABASE_JWT=***
set E2E_CLEANER_SUPABASE_JWT=***
set E2E_ADMIN_SUPABASE_JWT=***
set PLAYWRIGHT_SKIP_WEBSERVER=1
npm run test:e2e -- e2e/dispatch
```

## Manual vs automatic

| Spec | Automatic when env set | Manual / flaky notes |
|------|-------------------------|----------------------|
| `auto-assign-lifecycle.spec.ts` | Creates booking + dispatch | Cleaner triplet only if JWT matches assigned cleaner; otherwise customer/admin only. |
| `selected-cleaner-offer.spec.ts` | Seeds offer + accepts | Requires `E2E_DISPATCH_SELECTED_CLEANER_ID` aligned with cleaner JWT. |
