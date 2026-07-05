# Revenue path smoke (Phase D)

End-to-end **staging** check for the paid booking → dispatch → cleaner lifecycle → customer completion path.

## What it covers

| Step | Mechanism |
|------|-----------|
| Paid booking | `POST /api/test/create-booking` (load-test harness with Paystack reference) |
| Dispatch | Auto-assign via `ensureBookingAssignment` |
| Cleaner accept | `POST /api/cleaner/jobs/:id` `{ action: "accept" }` (no-op if already accepted) |
| Field lifecycle | `en_route` → `start` → `complete` on cleaner jobs API |
| Customer verify | `GET /api/customer/bookings` → `operationalPhase === completed` |

Full `/book` UI + Paystack sandbox checkout is covered separately under `e2e/paystack/` and `e2e/launch/`.

## Environment

All variables from [`e2e/dispatch/README.md`](../dispatch/README.md), plus:

| Variable | Purpose |
|----------|---------|
| `E2E_REVENUE_PATH` | Set to `1` to un-skip this spec. |
| `E2E_DISPATCH` | Must also be `1`. |
| `E2E_DISPATCH_LOAD_TEST_SECRET` | Server `DISPATCH_LOAD_TEST_SECRET`. |
| `E2E_CUSTOMER_SUPABASE_JWT` | Customer session JWT (`sub` linked via harness). |
| `E2E_CLEANER_SUPABASE_JWT` | Must match the cleaner dispatch assigns (same note as dispatch specs). |
| `PLAYWRIGHT_BASE_URL` | Staging / preview URL. |

## Run

**PowerShell (Windows):**

```powershell
cd apps/web
$env:E2E_REVENUE_PATH = "1"
$env:E2E_DISPATCH = "1"
$env:E2E_DISPATCH_LOAD_TEST_SECRET = "your-secret"
$env:E2E_CUSTOMER_SUPABASE_JWT = "eyJ..."
$env:E2E_CLEANER_SUPABASE_JWT = "eyJ..."
$env:PLAYWRIGHT_SKIP_WEBSERVER = "1"   # if dev server already running
$env:PLAYWRIGHT_BASE_URL = "http://localhost:3000"
npm run test:e2e -- e2e/smoke/revenue-path.spec.ts
```

Or put the same keys in `.env.local` (Playwright loads it automatically — no `$env:` needed each run).

**One-time `.env.local` for live/staging:**

```env
PLAYWRIGHT_BASE_URL=https://your-preview.vercel.app
E2E_REVENUE_PATH=1
E2E_DISPATCH=1
DISPATCH_LOAD_TEST_SECRET=same-value-as-on-the-server
E2E_CUSTOMER_SUPABASE_JWT=eyJ...
E2E_CLEANER_SUPABASE_JWT=eyJ...
```

`E2E_DISPATCH_LOAD_TEST_SECRET` is optional if `DISPATCH_LOAD_TEST_SECRET` is already in the same file.

Then from `apps/web`:

```bash
npm run test:e2e:revenue
```

From repo root (no `cd`):

```bash
npm run test:e2e:revenue --prefix apps/web
```

On **production**, the server must also have `ENABLE_DISPATCH_LOAD_TEST=true` or the load-test route returns 404.

**cmd.exe:**

```bash
cd apps/web
set E2E_REVENUE_PATH=1
set E2E_DISPATCH=1
set E2E_DISPATCH_LOAD_TEST_SECRET=***
set E2E_CUSTOMER_SUPABASE_JWT=***
set E2E_CLEANER_SUPABASE_JWT=***
set PLAYWRIGHT_SKIP_WEBSERVER=1
set PLAYWRIGHT_BASE_URL=http://localhost:3000
npm run test:e2e -- e2e/smoke/revenue-path.spec.ts
```

## CI

Not run in default CI — same opt-in policy as dispatch lifecycle specs (`E2E_DISPATCH`).
