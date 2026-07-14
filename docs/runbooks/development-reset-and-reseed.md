# Development reset and reseed

**Environment:** `shalean-platform-development` (`mbvixuzfvzbooiurvxwz`)  
**Never** run against production (`tchayecuvzssixyxlvfu`).

## Preconditions

- CLI linked temporarily to development only for the apply window
- Keys in `docs/audits/environments/evidence/.secrets-local/development.keys.env` (gitignored)
- Confirm `supabase/.temp/project-ref` is restored to production after any link switch

## Schema rebuild

```bash
npx supabase link --project-ref mbvixuzfvzbooiurvxwz --yes
npx supabase migration up --linked --yes
npx supabase link --project-ref tchayecuvzssixyxlvfu --yes
```

Do **not** use `supabase db push`. Do **not** replay `supabase/migrations-legacy`.

## Seed

```bash
node scripts/env/seed-nonprod.mjs --env development
node scripts/env/seed-nonprod.mjs --env development --reset
```

Creates:

- Synthetic auth users (`development-*@shalean.test`)
- Catalog fixtures
- Isolation booking markers `ENV-03-DEV-<timestamp>-*`

Passwords: `docs/audits/environments/evidence/.secrets-local/development.synthetic-passwords.env` (gitignored).

## Safe cleanup

```sql
-- development project only
delete from public.bookings where paystack_reference like 'ENV-03-DEV-%';
```

Disposable fixtures are expected; full wipe of synthetic users is allowed.

## Backup / recovery

- Development may be rebuilt from migrations + seed without production data
- Ownership: Shalean Cleaning org, dedicated project `shalean-platform-development`

## Secret rotation

Rotate development keys in Supabase, update Vercel Preview (`gitBranch=development`), redeploy.
