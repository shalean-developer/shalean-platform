# Supabase Backend Architecture

Full migration design: **[docs/backend-migration-architecture.md](../docs/backend-migration-architecture.md)**

## Quick reference

| Directory | Purpose |
|-----------|---------|
| `functions/_shared/` | Reusable Deno modules (contracts only until approved) |
| `functions/whatsapp-worker/` | Phase 1 — WhatsApp queue drain |
| `functions/dispatch-timeouts/` | Phase 1 — Offer expiry + reassignment |
| `functions/retry-*/` | Phase 1 — Split from `retry-failed-jobs` monolith |
| `migrations/` | **Active** PostgreSQL schema (baseline + forward deltas) |
| `migrations-legacy/` | Archive only — historical unreplayable SQL (ignored for CLI replay) |

**Migration governance:** [docs/database-baseline/migration-governance.md](../docs/database-baseline/migration-governance.md)  
**Validate filenames:** `npm run db:migrations:validate`

**Status:** Architecture scaffold — no production cutover yet.
