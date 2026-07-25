# AGENTS.md

## Cursor Cloud specific instructions

### Repo shape
- npm-based monorepo (no root workspace). Each app installs independently with `npm ci` in its own dir; there is no top-level install. Node 20+ (`engines` in root `package.json`).
- Shared code lives in `packages/*` and is linked into apps via `file:` deps (e.g. `apps/web/node_modules/@shalean/*` symlink to `packages/*`).
- Primary runnable service is `apps/web` (Next.js 16 App Router) — it is the backend/API (`/api/*`) for all clients. The two Expo apps (`apps/mobile` = cleaner, `apps/customer-mobile` = customer) are thin clients that call this API and default `EXPO_PUBLIC_API_BASE_URL` to production.

### Running `apps/web` (dev)
- The update script runs `npm ci` in `apps/web`. To start: `cd apps/web && npm run dev` (Next.js webpack, port 3000). Health check: `GET /api/health`.
- CRITICAL: open the dev server via `http://localhost:3000`, NOT `http://127.0.0.1:3000`. On Next 16, `127.0.0.1` is treated as a cross-origin host and `/_next/webpack-hmr` + dev chunks are blocked, so client components never hydrate (client pages like `/book/<service>` get stuck on gray skeleton loaders forever). `localhost` works.
- Use `npm run dev` (webpack), not `dev:turbo` — Turbopack's default root (`apps/web`) can't resolve the `file:../../packages/*` deps.

### Env / graceful degradation
- The app boots and degrades gracefully with no secrets: marketing/blog pages and the booking form (real-time pricing via `@shalean/pricing`, static `SERVICE_CONFIG` fallback) all work without a database.
- DB-backed features require Supabase env in `apps/web/.env.local` (copy from `apps/web/.env.example`): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. Also add `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY` + `PAYSTACK_SECRET_KEY` for the payment path. Without Supabase you will see "Area not yet covered / server configuration error" on suburb validation; auth, admin/office, dispatch, and payments also need real creds. Minimal `apps/web/.env.local`:
  ```
  SHALEAN_APP_ENV=development
  NEXT_PUBLIC_SITE_URL=http://localhost:3000
  OUTBOUND_MESSAGING_DISABLED=true
  NEXT_PUBLIC_SUPABASE_URL=...
  NEXT_PUBLIC_SUPABASE_ANON_KEY=...
  SUPABASE_URL=...   # same as NEXT_PUBLIC_SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY=...
  NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY=...
  PAYSTACK_SECRET_KEY=...
  ```
- **Dev DB is empty by default (schema only, no seed data).** The development Supabase project has migrations applied but no city/location/booking data. Suburb resolution (`/api/booking-v2/resolve-location`) returns "unresolved_suburb" for all suburbs until you seed rows into `cities` and `locations`. To unblock the full booking flow, seed at minimum one city and a few location rows (use the Supabase REST API or dashboard). There is one pre-seeded test cleaner (`TEST Development Cleaner`, id `dfdde545-77da-4ef9-81e4-8931630687e8`) — assign it to a location by setting `city_id` and `location_id` on the cleaner row.

### Lint / test / build (see `apps/web/package.json` + `apps/web/README.md`)
- CI gates (`.github/workflows/web-test.yml`) are the source of truth: `npm run test:critical`, `npm run lint:booking-core`, and `npm run typecheck` — all pass clean. `npm run build` (validate-blog-routes + typecheck + `next build --webpack`) also succeeds.
- Do NOT treat full `npm run lint` as a gate: it reports pre-existing errors/warnings and is not run in CI. Use `lint:booking-core` for the enforced lint gate.

### Development database seed
- Dev DB (Supabase project `mbvixuzfvzbooiurvxwz`) has migrations applied but no data by default. Run the seed from repo root (requires `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` set in `apps/web/.env.local` or as env vars):
  ```
  npm run db:seed:dev        # seed / re-seed (idempotent)
  npm run db:seed:dev:reset  # wipe seed rows then re-seed
  npm run db:seed:dev:dry-run  # print plan without writing
  npm run db:seed:reference  # export reference pricing from dev DB
  ```
- The seed creates: 1 city (Cape Town), 7 suburbs, 6 pricing services, 26 extras, 17 auth users (3 admin, 6 cleaner, 8 customer), 15 bookings, 3 recurring schedules, 5 earnings rows, 5 payout rows, 2 monthly invoices, 5 admin proposals.
- All seed emails use `@example.com` (IANA reserved, undeliverable). All seed phones use `+27000...` — the `000` area prefix is structurally impossible in South Africa (SA area codes never begin with zero) and cannot route to any real recipient via Twilio, Meta, or any provider.
- The seed has a multi-layer safety guard in `scripts/seed-dev.mjs`: (1) refuses the production project ref `tchayecuvzssixyxlvfu`, (2) only allows the explicit dev/staging ref allow-list, (3) requires `SHALEAN_APP_ENV=development|staging`. `process.env` overrides the file value so `SHALEAN_APP_ENV=production` always blocks.
- Outbound comms guard: `apps/web/lib/seed/devSeedGuard.ts` exports `assertNotSeedRecipient()`, `assertNotSeedWhatsApp()`, `assertNotSeedSms()`, `assertNotSeedEmail()` — import and call these before any SMS/WhatsApp/email/push provider call in non-production code paths. No-op in `NODE_ENV=production`.
- Seed script location: `scripts/seed-dev.mjs`. Reference pricing SQL: `supabase/seed/reference/pricing.sql`.
- Unit tests for seed safety: `apps/web/lib/seed/__tests__/seedSafety.test.ts` (43 tests).

### Mobile apps
- Not installed by the update script. Install on demand with `npm ci` inside `apps/mobile` or `apps/customer-mobile`, then `npm start` (Expo). See each app's own README/AGENTS.md.
