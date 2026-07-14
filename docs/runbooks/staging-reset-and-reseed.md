# Staging reset and reseed

**Environment:** `shalean-platform-staging` (`gbgnemlpyykyhpqqbgru`)  
**Never** run against production (`tchayecuvzssixyxlvfu`).

## Preconditions

- CLI linked temporarily to staging only for the apply window
- Keys in `docs/audits/environments/evidence/.secrets-local/staging.keys.env` (gitignored)
- Confirm `supabase/.temp/project-ref` is restored to production after any link switch

## Schema rebuild

```bash
npx supabase link --project-ref gbgnemlpyykyhpqqbgru --yes
npx supabase migration up --linked --yes
npx supabase link --project-ref tchayecuvzssixyxlvfu --yes
```

Do **not** use `supabase db push`. Do **not** replay `supabase/migrations-legacy`.

Approved active migrations only (see environment audit § Approved Schema Manifest).

## Seed

```bash
node scripts/env/seed-nonprod.mjs --env staging
# optional cleanup of prior ENV-03 booking fixtures first:
node scripts/env/seed-nonprod.mjs --env staging --reset
```

Creates:

- Synthetic auth users (`staging-*@shalean.test`)
- Catalog fixtures (`pricing_services`, `services`, `promotions`)
- Isolation booking markers `ENV-03-STG-<timestamp>-*`

Passwords: `docs/audits/environments/evidence/.secrets-local/staging.synthetic-passwords.env` (gitignored).

## Safe cleanup

```sql
-- staging project only
delete from public.bookings where paystack_reference like 'ENV-03-STG-%';
```

Auth users may be retained for stable UAT logins; delete only if rotating fixtures.

## Backup / recovery

- Prefer Supabase project backups / PITR on the dedicated staging project
- Rebuild path: empty project → `migration up` → seed script
- No production data import

## Secret rotation

Rotate staging anon/service keys in Supabase dashboard, then update Vercel Preview (`gitBranch=staging`) vars and redeploy. Do not copy production keys.
