# MKT-001M.1 — Historical Migration Reproducibility Correction

| Field | Value |
|-------|-------|
| **Date (UTC)** | 2026-07-20 |
| **Class** | Syntax / clean-environment reproducibility |
| **Production mutation** | **None** (no deploy, no schema/cron/history change) |
| **Governance exception** | `MIG-HIST-001` — see `docs/database-baseline/migration-governance.md` |

## File

`supabase/migrations/20260717120000_mkt_001b2_social_publish_jobs.sql`

## Hashes

| State | SHA256 | Git blob |
|-------|--------|----------|
| **Original** (nested `$$`) | `d11c12506ae312cc6e8b80f7f2eee5c38e5f8656e58783a100df2883892bbb4a` | `6714de3482f395cda524b65efcbf46d361515bb1` |
| **Corrected** (`$do$` / `$cron$`) | `9a86369a8739d7c4e99dcfe47616ac0277fe6503b110e9bb5adae677ca4cb178` | `762673ff0e0eb74c736b494b422337cd91cda534` |

## Reason for historical correction

The post-`COMMIT` cron block used identical dollar-quote tags:

```sql
DO $$
  …
  PERFORM cron.schedule(…, $$select …;$$);
END
$$;
```

PostgreSQL closes a `$tag$` (including `$$`) at the **first** subsequent matching delimiter. Nested reuse is invalid SQL and fails on a clean apply (local reset / fresh environments), even when production was repaired manually after a partial apply.

## Correction

- Outer anonymous block: `$do$ … $do$`
- Embedded cron command: `$cron$ … $cron$`
- Intended behaviour unchanged: unschedule prior names, schedule `social-publish-jobs` at `*/5 * * * *` invoking `/api/cron/process-social-publish-jobs`, skip when `pg_cron` or `invoke_nextjs_cron` is absent.

## Production disposition

| Check | Result |
|-------|--------|
| Version `20260717120000` in `schema_migrations` | Applied (MKT-001M) |
| Cron repair during release | In-place `$cron$` repair; job `social-publish-jobs` `*/5 * * * *` |
| Schema (`social_publish_jobs`, claim/recover RPCs) | Present and correct |
| Content change re-apply? | **No** — Supabase records version once; file edit does not enqueue a pending migrate |
| Forward production migration required? | **No** — production end state already matches intended behaviour |

## Why no forward production SQL

Forward migrations are for new schema/behaviour. Production cron/schema already match the corrected file’s intent. A no-op forward migration would only add noise to history. The historical file edit restores **replay reproducibility** for clean environments and CI.

## CI

`scripts/validate-supabase-migrations.mjs` rejects nested reuse of a DO-block dollar-quote delimiter (`npm run db:migrations:validate`).

## Verification (this change)

| Gate | Result |
|------|--------|
| Nested-quote CI probe (bad `$$` DO) | **FAIL** as expected (exit 1) |
| `npm run db:migrations:validate` | **PASS** |
| `npx supabase db reset` | **PASS** (exit 0); applied `20260717120000` cleanly |
| Local `social_publish_jobs` + claim/recover RPCs | **Present** |
| Local cron | One row `social-publish-jobs`, schedule `*/5 * * * *`, command invokes process-social-publish-jobs |
| `mkt001b2Migration.contract.test.ts` | **4/4 PASS** |
| Production read-only | Version applied; cron correct; table/RPCs present; `migration list` shows local+remote `20260717120000` (not pending solely due to content edit) |
| Production mutation | **None** |