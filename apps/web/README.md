# Shalean web (`apps/web`)

Next.js App Router app for booking, Paystack checkout, cleaner/dispatch, and admin.

## Local dev

```bash
cd apps/web
npm install
cp .env.example .env.local   # if present; otherwise copy from team vault
npm run dev
```

Env: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, Paystack keys — see Vercel project settings.

## Tests

| Command | Purpose |
|---------|---------|
| `npm run test:critical` | CI payment/referral gates (~31 tests) |
| `npm run test` | Full vitest (~2248 tests) |
| `npx tsc --noEmit` | Typecheck |
| `npm run build` | Production build |
| `npm run ops:smoke` | Ops checklist (needs service role + DB) |
| `npm run test:e2e` | Playwright — see [`e2e/README.md`](e2e/README.md) |

Revenue issue register: [`docs/PLATFORM_ISSUES.md`](../../docs/PLATFORM_ISSUES.md). Payments ops: [`docs/runbook-payments.md`](../../docs/runbook-payments.md).
