# Playwright E2E (booking)

## Prerequisites

- Node deps installed (`npm install` in `apps/web`).
- Browsers: `npx playwright install chromium` (once per machine/CI image).

## Environment

| Variable | Purpose |
|----------|---------|
| `PLAYWRIGHT_BASE_URL` | Base URL for tests (default `http://localhost:3000`). |
| `PLAYWRIGHT_SKIP_WEBSERVER` | Set to `1` if the app is already running (or when targeting a remote preview URL). |
| `E2E_WIDGET_DRAFT` | Set to `1` to enable the **widget-draft insert** smoke test (needs Supabase admin on the server). |
| `E2E_PAYSTACK` | Set to `1` to enable **Paystack sandbox** API tests under `e2e/paystack/` (see `e2e/paystack/README.md`). |
| `E2E_DISPATCH` | Set to `1` where specs gate on dispatch lifecycle (staging only; not run in default CI). |

Revenue E2E is intentionally **env-gated**. For staging runs, set `PLAYWRIGHT_BASE_URL` to the preview URL and supply Supabase service role on the server. See also [`docs/PLATFORM_ISSUES.md`](../../docs/PLATFORM_ISSUES.md) (REV-012).

Server-side (for quote + widget-draft to succeed):

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (used by Next server where applicable)
- `SUPABASE_SERVICE_ROLE_KEY` (for `getSupabaseAdmin()` — pricing catalog + inserts)

Optional later:

- Customer/cleaner/admin auth tokens for authenticated flows (Gap 4).

## Scripts

```bash
cd apps/web
npx playwright install chromium
npm run test:e2e
```

With UI:

```bash
npm run test:e2e:ui
```

Against an already-running dev server:

```bash
set PLAYWRIGHT_SKIP_WEBSERVER=1
npm run test:e2e
```

(On Unix: `export PLAYWRIGHT_SKIP_WEBSERVER=1`.)

## Scope (current)

- Booking redirect smoke.
- Widget quote API.
- Widget draft API (opt-in via `E2E_WIDGET_DRAFT=1`).

### Paystack sandbox (Gap 3)

See **[e2e/paystack/README.md](./paystack/README.md)** for `E2E_PAYSTACK`, `E2E_PAYSTACK_VERIFY_REFERENCE`, optional full checkout (`E2E_PAYSTACK_FULL`), and optional webhook replay (`E2E_PAYSTACK_WEBHOOK_REPLAY`).

### Dispatch + dashboard lifecycle (Gap 4)

See **[e2e/dispatch/README.md](./dispatch/README.md)** and **[e2e/dashboard/README.md](./dashboard/README.md)** for `E2E_DISPATCH`, JWT env vars, and `/api/test/create-booking` linkage fields.
