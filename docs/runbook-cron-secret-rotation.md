# Runbook: `CRON_SECRET` rotation & Supabase pg_cron alignment

All production schedulers run in **Supabase `pg_cron` + `pg_net`**, not Vercel. HTTP crons call Next.js `/api/cron/*` via `public.invoke_nextjs_cron()` (migration `20261005_consolidate_all_http_crons_in_supabase.sql`).

`apps/web/vercel.json` has **no** `crons` block. If **Vercel → shalean-platform → Settings → Cron Jobs** still lists jobs, delete them so only Supabase triggers schedules (avoids duplicate runs and Hobby limits).

Routes authenticate with **`CRON_SECRET`** via `verifyCronSecret` (`apps/web/lib/cron/verifyCronSecret.ts`): accept **`Authorization: Bearer <secret>`** (scheme case-insensitive per RFC 7235; token trimmed) or **`x-cron-secret: <secret>`** (trimmed, exact match).

---

## One-time: move crons from Vercel to Supabase

1. **Apply migrations** through `20261005` (and later) on production Supabase.
2. From `apps/web`, generate setup SQL:
   ```bash
   node scripts/print-setup-supabase-crons.sql.mjs
   ```
3. Paste output into **Supabase Dashboard → SQL Editor → Run**.
4. In **Vercel → shalean-platform → Settings → Cron Jobs**, **delete all** cron jobs.
5. Keep **`CRON_SECRET`** on Vercel (API routes still validate it when Supabase calls in).
6. Verify: `node scripts/check-cron-health.mjs` (from `apps/web`).

Set the singleton row (SQL Editor):

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

---

## Edge Function cron cutover (Phase 1+)

Background workers are migrating from Vercel `/api/cron/*` to **Supabase Edge Functions**. See `docs/backend-migration-architecture.md`.

### Prerequisites

1. Apply migration `20261054_invoke_edge_cron.sql`.
2. Deploy function: `supabase functions deploy whatsapp-worker --project-ref <ref>`
3. Set Edge secrets (Dashboard → Edge Functions → Secrets) — mirror `supabase/functions/.env.example`.
4. Update `cron_http_targets`:

```sql
update public.cron_http_targets
set edge_base_url = 'https://<project-ref>.supabase.co/functions/v1',
    cron_secret = '<same value as Vercel CRON_SECRET>',
    updated_at = now()
where singleton;
```

### Shadow verification (before pg_cron cutover)

**Do not reschedule pg_cron until shadow checks pass.** Vercel route stays active.

Manual invoke (replace URL and secret):

```bash
curl -sS -X POST "https://<project-ref>.supabase.co/functions/v1/whatsapp-worker?metrics=1" \
  -H "Authorization: Bearer <CRON_SECRET>" \
  -H "Content-Type: application/json"
```

Compare `cron_runs` / `system_logs` for `job_name = 'whatsapp-worker'` and `runtime = supabase_edge` vs existing Vercel entries.

### Cutover single job

```sql
select cron.unschedule('whatsapp-worker');
select cron.schedule(
  'whatsapp-worker',
  '* * * * *',
  $$select public.invoke_edge_cron('whatsapp-worker');$$
);
```

### Rollback

```sql
select cron.unschedule('whatsapp-worker');
select cron.schedule(
  'whatsapp-worker',
  '* * * * *',
  $$select public.invoke_nextjs_cron('/api/cron/whatsapp-worker');$$
);
```

---

## When to rotate

- Any chance the value was copied into chat, tickets, or logs.
- After intermittent **`Unauthorized`** responses — rotate once traffic is pinned to a single production deployment with one env definition.

---

## Step 1 — Generate a new secret

```bash
openssl rand -hex 32
```

Store it in your password manager as the new production cron secret.

---

## Step 2 — Vercel (Next.js env only)

1. **Settings → Environment Variables**
2. Set **`CRON_SECRET`** for **Production** (still required by API routes; Vercel no longer triggers crons).
3. **Redeploy Production** after changes.

---

## Step 3 — Supabase

Update the singleton config (no need to reschedule individual jobs):

```sql
update public.cron_http_targets
set cron_secret = '<NEW_SECRET>',
    updated_at = now()
where singleton;
```

Confirm **`app_base_url`** points at production (no trailing slash on host).

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

## SQL-only crons (no HTTP)

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
