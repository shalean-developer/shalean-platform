# Runbook: `CRON_SECRET` rotation & recurring cron alignment

Supabase **`pg_cron`** calls the Next.js recurring endpoints. Those routes authenticate with **`CRON_SECRET`** via `verifyCronSecret` (`apps/web/lib/cron/verifyCronSecret.ts`): accept **`Authorization: Bearer &lt;secret&gt;`** or **`x-cron-secret: &lt;secret&gt;`** (trimmed, exact match).

Cron job SQL template: `supabase/migrations/20260910_supabase_cron_recurring_bookings_http.sql` (replace placeholders before scheduling; do not commit real secrets).

---

## When to rotate

- Any chance the value was copied into chat, tickets, or logs.
- After chasing intermittent **`Unauthorized`** responses—rotate once traffic is pinned to a single production deployment with one env definition.

---

## Step 1 — Generate a new secret

Use a long random string (example):

```bash
openssl rand -hex 32
```

Store it in your password manager as the new production cron secret.

---

## Step 2 — Vercel

1. **Settings → Environment Variables**
2. Set **`CRON_SECRET`** for **Production**.
3. Use **Preview** / **Development** only if those URLs are intentionally called by cron (usually they are not—omit or use different secrets per environment).
4. Remove duplicate or stale variable entries (same name, wrong scope).
5. **Redeploy Production** (Deployments → ⋯ → Redeploy). Running lambdas keep old env until a new deployment is active.

---

## Step 3 — Supabase `pg_cron` jobs

Both jobs must send the **same** secret string Vercel Production uses.

1. List jobs:

   ```sql
   select jobname, schedule, active
   from cron.job
   where jobname in ('generate-recurring-bookings', 'charge-recurring-bookings');
   ```

2. Update definitions so each `net.http_post` includes:

   - URL: `https://<production-host>/api/cron/generate-recurring-bookings` (no trailing slash on the host; path as implemented).
   - Headers: **`Content-Type: application/json`**, **`Authorization: Bearer &lt;NEW_SECRET&gt;`**, **`x-cron-secret: &lt;NEW_SECRET&gt;`**, body `{}`.

   Follow the `cron.unschedule` / `cron.schedule` pattern in `20260910_supabase_cron_recurring_bookings_http.sql`, or run equivalent SQL in the Supabase SQL editor.

3. Confirm **both** job bodies use **identical** header values (a typo in one job mimics “random” 401s).

---

## Step 4 — Manual verification (immediate)

From a trusted machine (replace host and secret):

```bash
curl -i -X POST "https://<PRODUCTION_HOST>/api/cron/generate-recurring-bookings" \
  -H "Authorization: Bearer <NEW_SECRET>" \
  -H "x-cron-secret: <NEW_SECRET>" \
  -H "Content-Type: application/json" \
  -d "{}"
```

Repeat for **`/api/cron/charge-recurring-bookings`**.

| HTTP | Meaning |
|------|--------|
| **401** | Secret mismatch vs `CRON_SECRET` on the deployment that served the request, or wrong host (e.g. preview). |
| **503** with `CRON_SECRET not configured` | That deployment has no `CRON_SECRET`. |
| **200** | Auth passed; inspect JSON for business outcome. |
| **500** | Auth passed; check response body and `cron_runs` / logs (may be Paystack, DB, etc.). |

---

## Step 5 — Verify `cron_runs`

After one or two schedule ticks (e.g. every 10 minutes):

```sql
select job_name, status, message, created_at
from public.cron_runs
where created_at > now() - interval '30 minutes'
order by created_at desc
limit 30;
```

Error **`message`** values may be prefixed by phase: **`[auth]`**, **`[env]`**, **`[recurring_bookings_select]`**, **`[bookings_select]`**, **`[handler]`** (see `generate-recurring-bookings` and `charge-recurring-bookings` route handlers).

---

## Troubleshooting

### Intermittent `Unauthorized` on one route while the other succeeds

Often **not** “different code paths”—same auth. Check:

- Both cron jobs use the **exact** same secret string in SQL.
- Cron targets **production** hostname only, not preview URLs.
- After env changes, **production was redeployed** so no stale instances serve old secrets.

### `cron_runs` stays empty but curl returns 200

Inserts require a configured Supabase admin client on the app (**service role** URL/key). Confirm Production env for Supabase server access; see `logCronRun` in `apps/web/lib/logging/systemLog.ts`.

### Errors like `[recurring_bookings_select]` / PostgREST column messages

Schema or migration drift—not secret related. Apply pending migrations and align Supabase with `main`.

---

## Related

- Payments & bookings: `docs/runbook-payments.md`
