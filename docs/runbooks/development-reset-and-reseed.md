# Development reset and reseed

**Environment:** local Supabase only.  
**Never** run development reset/reseed commands against production (`tchayecuvzssixyxlvfu`) or the retired staging project (`gbgnemlpyykyhpqqbgru`).

The former cloud development branch/project has been retired as part of CR-03 cost reduction. CR-04 standardizes day-to-day development on the Supabase CLI local stack plus local Next.js.

## Preconditions

- Node.js 20 or newer.
- Docker Desktop or another Docker-compatible runtime is running.
- Supabase CLI is available through `npx supabase`.
- `apps/web/.env.local` is gitignored and must contain local-only values.
- Do not `supabase link` during normal local development.

## First-time setup

From the repository root:

```bash
npm run dev:local:start
npm run dev:local:env
npm run dev:local:check
```

`npm run dev:local:env` captures the local Supabase CLI environment internally and writes the required local URL/keys directly to `apps/web/.env.local`. It does **not** print the anon or service-role key to terminal output. On macOS/Linux it also applies restrictive file permissions where supported.

The environment check fails if the app is configured for a hosted `*.supabase.co` URL, a non-local host, the wrong API port, or missing local keys.

## Daily start

Terminal 1:

```bash
npm run dev:local:start
npm run dev:local:env
npm run dev:local:check
npm run dev:local:web
```

Terminal 2 can be used for tests, migrations, or CLI commands. Supabase Studio is normally available at `http://127.0.0.1:54323`.

Expected topology:

```text
Local Next.js -> local Supabase
GitHub PR/CI -> tests/builds
main -> Vercel production -> production Supabase
```

There is no persistent cloud development database in this workflow.

## Useful local commands

```bash
npm run dev:local:status
npm run dev:local:env
npm run dev:local:reset
npm run dev:local:seed:catalog
npm run dev:local:stop
```

`dev:local:env` refreshes local credentials in the ignored `.env.local` without echoing secret values. `dev:local:reset` explicitly uses `supabase db reset --local`; the explicit `--local` flag prevents accidentally resetting a linked remote database.

Do **not** use `supabase db push` for routine development. Do **not** replay `supabase/migrations-legacy`.

## Seed local development data

Do not use `scripts/env/seed-nonprod.mjs --env development`; that is a legacy remote-environment script and is not part of the local-only workflow.

For the approved ENV-03 catalog/fixture SQL, run:

```bash
npm run dev:local:seed:catalog
```

This targets the local database explicitly. Use synthetic test data only. Never import production customer data into local development unless a separately approved, sanitized workflow is introduced.

The older `db:seed:dev` helper is not part of the CR-04 standard local workflow because it was originally designed around hosted non-production project refs. Do not use it until it is separately converted to local-only semantics.

## Stop local development

Preserve local database state:

```bash
npm run dev:local:stop
```

Discard all local database state intentionally:

```bash
npm run dev:local:clean
```

## Production safety

- Production ref remains `tchayecuvzssixyxlvfu`.
- Normal development must not use `supabase link` to production.
- Runtime environment safety rejects hosted `*.supabase.co` project URLs when the app resolves to `development` or `local`.
- `npm run dev:local:web` runs the local environment checker before starting Next.js.
- Local service-role credentials are written only to the gitignored `.env.local` and are not printed by the standard workflow.
- Never place production service-role keys in local committed files.
- Any remote migration/application step must be performed through the governed production deployment workflow, not from this local reset/reseed procedure.

## Recovery

Local development is disposable and can always be recreated from migrations plus approved synthetic seed data:

```bash
npm run dev:local:clean
npm run dev:local:start
npm run dev:local:env
npm run dev:local:reset
npm run dev:local:seed:catalog
npm run dev:local:check
npm run dev:local:web
```
