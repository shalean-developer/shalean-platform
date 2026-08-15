# Runbook: `CRON_SECRET` rotation & Supabase pg_cron alignment

All production schedulers run in **Supabase `pg_cron` + `pg_net`**, not Vercel. HTTP crons call Next.js `/api/cron/*` via `public.invoke_nextjs_cron()`.

`apps/web/vercel.json` has **no** `crons` block. If **Vercel → shalean-platform → Settings → Cron Jobs** still lists jobs, delete them so only Supabase triggers schedules.

Routes authenticate with **`CRON_SECRET`** via `verifyCronSecret` (`apps/web/lib/cron/verifyCronSecret.ts`): accept **`Authorization: Bearer <secret>`** or **`x-cron-secret: <secret>`**.

---

## Canonical production cron runtime

Production HTTP crons are scheduled in Supabase and invoke the Next.js application through `public.invoke_nextjs_cron()`.

For WhatsApp specifically, CR-07A retired the duplicate Supabase Edge Function worker. The canonical runtime is:

- `apps/web/app/api/cron/whatsapp-worker/route.ts`
- `apps/web/lib/whatsapp/providerQueue.ts`

Do **not** deploy or cut over to `supabase/functions/whatsapp-worker`; that executable worker has been retired. Historical Edge Function migration documents are design history only and are not an active production procedure.

---

## One-time: move crons from Vercel to Supabase

1. Apply current governed migrations on production Supabase.
2. From `apps/web`, generate setup SQL:
   ```bash
   node scripts/print-setup-supabase-crons.sql.mjs
   ```
3. Paste output into **Supabase Dashboard → SQL Editor → Run**.
4. In **Vercel → shalean-platform → Settings → Cron Jobs**, **delete all** cron jobs.
5. Keep **`CRON_SECRET`** on Vercel because API routes validate it when Supabase calls in.
6. Verify with `node scripts/check-cron-health.mjs` from `apps/web`.

Set the singleton row:

```sql
update public.cron_http_targets
set app_base_url = 'https://shalean.co.za',
    cron_secret = '<same value as Vercel env CRON_SECRET>',
    updated_at = now()
where singleton;
```

Verify scheduled jobs:

```sql
select jobname, schedule, active
from cron.job
order by jobname;
```

For `whatsapp-worker`, the command must continue to invoke the Next.js route, for example:

```sql
select public.invoke_nextjs_cron('/api/cron/whatsapp-worker');
```

---

## When to rotate

- Any chance the value was copied into chat, tickets, or logs.
- After intermittent **`Unauthorized`** responses once traffic is pinned to a single production deployment with one env definition.

---

## Step 1 — Generate a new secret

```bash
openssl rand -hex 32
```

Store it in your password manager as the new production cron secret.

---

## Step 2 — Vercel (Next.js env only)

1. **Settings → Environment Variables**
2. Set **`CRON_SECRET`** for **Production**.
3. **Redeploy Production** after changes.

---

## Step 3 — Supabase

Update the singleton config; individual jobs do not need to be rescheduled:

```sql
update public.cron_http_targets
set cron_secret = '<NEW_SECRET>',
    updated_at = now()
where singleton;
```

Confirm **`app_base_url`** points at production with no trailing slash.

---

## Step 4 — Manual verification

```bash
curl -i -X POST "https://<PRODUCTION_HOST>/api/cron/booking-lifecycle" \
  -H "Authorization: Bearer <SECRET>" \
  -H "x-cron-secret: <SECRET>" \
  -H "Content-Type: application/json" \
  -d "{}"
```

| HTTP | Meaning |
|------|--------|
| **401** | Secret mismatch vs `CRON_SECRET` on the deployment, or wrong host. |
| **503** with `CRON_SECRET not configured` | Deployment missing `CRON_SECRET`. |
| **200** | Auth passed; inspect JSON for business outcome. |
| **500** | Auth passed; check response body and `cron_runs` / logs. |

---

## Step 5 — Verify `cron_runs`

After one or two schedule ticks:

```sql
select job_name, status, message, created_at
from public.cron_runs
where created_at > now() - interval '30 minutes'
order by created_at desc
limit 30;
```

Local helper: `node apps/web/scripts/check-cron-health.mjs` (reads `.env.local`).

---

## SQL-only crons

These stay in Postgres and do **not** use `cron_http_targets`:

| Job | Function |
|-----|----------|
| `analytics-warehouse-nightly` | `public.run_analytics_warehouse_nightly()` |
| `purge-pending-payment-bookings` | `public.purge_stale_pending_payment_bookings()` |
| `prune-dispatch-offer-exposure-dedupe` | (see migration) |
| `prune-cleaner-job-lifecycle-idempotency` | (see migration) |
| `prune-notification-idempotency-shortlived` | (see migration) |
| `repair-empty-team-booking-rosters` | (see migration) |
| `refresh-dispatch-experiment-snapshots` | (see migration) |

---

## Related

- Payments & bookings: `docs/runbook-payments.md`
- WhatsApp worker retirement: `supabase/functions/whatsapp-worker/README.md`
