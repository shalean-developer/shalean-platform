# Development reset and reseed

**Environment:** local Supabase only.  
**Never** run development reset/reseed commands against production (`tchayecuvzssixyxlvfu`) or the retired staging project (`gbgnemlpyykyhpqqbgru`).

The former cloud development branch/project has been retired as part of CR-03 cost reduction. Development now runs on the Supabase CLI local stack.

## Preconditions

- Docker Desktop or another Docker-compatible runtime is running.
- Supabase CLI is available through the repository toolchain (`npx supabase ...`).
- `apps/web/.env.local` contains local-only values and is gitignored.
- Do not `supabase link` during normal local development.

## Start local Supabase

From the repository root:

```bash
npx supabase start
```

Read the local API URL and keys printed by the CLI, then configure `apps/web/.env.local` with local values only. Typical local URL:

```env
SHALEAN_APP_ENV=local
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_URL=http://127.0.0.1:54321
```

Use the local anon/service-role keys printed by `npx supabase status`. Never copy production keys into `.env.local`.

## Reset schema from migrations

```bash
npx supabase db reset --local
```

This rebuilds the local database from repository migrations. The explicit `--local` flag is required in this runbook so the command cannot accidentally target a linked remote database.

Do **not** use `supabase db push` for routine development. Do **not** replay `supabase/migrations-legacy`.

## Seed local development data

Do not use `scripts/env/seed-nonprod.mjs --env development`; that is a legacy remote-environment script and is not part of the local-only workflow.

For the ENV-03 catalog/fixture SQL that is safe to apply to the local database, run:

```bash
npx supabase db query --local -f supabase/seeds/nonprod/env03_catalog_and_fixtures.sql
```

This command targets the local database explicitly. Use synthetic test data only. Never import production customer data into local development unless a separately approved, sanitized workflow is introduced.

If a future fixture requires Auth API users, add a dedicated local-safe seed helper that obtains local credentials from `npx supabase status -o env`; do not revive a hosted development project merely to seed test users.

## Run the web app

```bash
cd apps/web
npm run dev
```

Expected topology:

```text
Local Next.js -> local Supabase
GitHub PR/CI -> tests/builds
main -> Vercel production -> production Supabase
```

There is no persistent cloud development database in this workflow.

## Stop local Supabase

```bash
npx supabase stop
```

Use `npx supabase stop --no-backup` when you explicitly want to discard the local database state.

## Production safety

- Production ref remains `tchayecuvzssixyxlvfu`.
- Normal development must not use `supabase link` to production.
- Runtime environment safety rejects hosted `*.supabase.co` project URLs when the app resolves to `development` or `local`.
- Never place production service-role keys in local committed files.
- Any remote migration/application step must be performed through the governed production deployment workflow, not from the local reset/reseed procedure.

## Recovery

Local development is disposable and can always be recreated from migrations plus approved synthetic seed data:

```bash
npx supabase stop --no-backup
npx supabase start
npx supabase db reset --local
npx supabase db query --local -f supabase/seeds/nonprod/env03_catalog_and_fixtures.sql
```
