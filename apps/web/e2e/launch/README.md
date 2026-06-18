# Launch readiness E2E

Opt-in Playwright coverage for pre-launch validation: booking-v2 UI, cross-dashboard API parity, role access, and Paystack checkout.

## Prerequisites

- Running app with Supabase admin configured
- Test users in Supabase Auth with matching `user_profiles.role` values

## Environment

| Variable | Purpose |
|----------|---------|
| `E2E_LAUNCH` | Set to `1` to un-skip launch specs |
| `E2E_CUSTOMER_SUPABASE_JWT` | Customer session JWT |
| `E2E_CLEANER_SUPABASE_JWT` | Cleaner session JWT |
| `E2E_ADMIN_SUPABASE_JWT` | Admin session JWT |
| `E2E_DISPATCH_LOAD_TEST_SECRET` | Same as server `DISPATCH_LOAD_TEST_SECRET` (cross-dashboard spec) |
| `E2E_DISPATCH` | Set to `1` for cross-dashboard spec (reuses dispatch harness) |
| `E2E_PAYSTACK` | Set to `1` for Paystack booking spec (see `e2e/paystack/README.md`) |
| `PLAYWRIGHT_BASE_URL` | Target app URL |

## Admin checklist (browser)

For a one-click pass/fail report without Playwright, sign in as admin and open:

`/office/launch-check`

Configure server env:

```
LAUNCH_CHECK_CUSTOMER_USER_ID=<uuid>
LAUNCH_CHECK_CLEANER_ID=<cleaners.id uuid>
LAUNCH_CHECK_ADMIN_EMAIL=admin@example.com
ENABLE_LAUNCH_CHECK=true   # required on production
```

## Run

```bash
cd apps/web
set E2E_LAUNCH=1
set E2E_CUSTOMER_SUPABASE_JWT=***
set E2E_ADMIN_SUPABASE_JWT=***
set PLAYWRIGHT_SKIP_WEBSERVER=1
npm run test:e2e -- e2e/launch
```

Paystack (optional):

```bash
set E2E_LAUNCH=1
set E2E_PAYSTACK=1
npm run test:e2e -- e2e/launch/paystack-booking.spec.ts
```

## Specs

| Spec | What it verifies |
|------|------------------|
| `booking-v2-ui.spec.ts` | `/book` entry and booking-v2 confirm API creates `pending_payment` |
| `cross-dashboard.spec.ts` | Load-test booking visible on customer, admin, cleaner APIs |
| `role-access.spec.ts` | Role resolve API returns correct dashboard routes |
| `paystack-booking.spec.ts` | Paystack verify idempotency (opt-in, reuses paystack harness) |
