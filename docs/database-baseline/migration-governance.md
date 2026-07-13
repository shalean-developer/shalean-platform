# Migration governance — active baseline era

**Status:** Active  
**Applies to:** `supabase/migrations`  
**Baseline:** `20260714010000_production_baseline.sql`  
**Archive:** `supabase/migrations-legacy` (not replayed)

## Active migration policy

1. **Only** `supabase/migrations` is the active replay directory for Supabase CLI / local reset / CI schema apply.
2. Every active migration filename **must** match:

   ```text
   ^\d{14}_[a-z0-9_]+\.sql$
   ```

   Examples:
   - Valid: `20260714010000_production_baseline.sql`
   - Valid: `20260715143022_add_booking_flag.sql`
   - Invalid: `20260715_add_flag.sql` (not 14 digits)
   - Invalid: `20260715143022_Add_Flag.sql` (uppercase)
   - Invalid: `supabase-bookings.sql` (no timestamp)

3. The **14-digit timestamp prefix must be unique** across files in `supabase/migrations`.
4. No non-`.sql` files and no subdirectories in `supabase/migrations`.
5. Generate new files with:

   ```bash
   npx supabase migration new <snake_case_description>
   ```

   Do not invent short date counters or hand-rename with non-14-digit stamps.

## Legacy archive status

| Path | Role |
|------|------|
| `supabase/migrations` | **Active** — baseline + forward deltas only |
| `supabase/migrations-legacy` | **Archive only** — historical unreplayable SQL retained for archaeology |

- Legacy files are **ignored for active replay**. They must not be moved back into `supabase/migrations` without an explicit remediation plan.
- Do not edit legacy migrations for day-to-day schema work.
- Supabase CLI defaults to `supabase/migrations` only; the `-legacy` folder is outside that path by design.

## Prohibition: dashboard-only schema changes

**Do not** change production (or shared staging) schema solely via the Supabase Dashboard SQL editor / table UI.

Dashboard-only DDL caused the pre-baseline history drift. Going forward:

1. Author a migration in git (`supabase migration new …`).
2. Review the SQL in a PR.
3. Apply via approved migration workflow (local verify → remote migrate / controlled push).
4. Emergency hotfix: still capture a follow-up migration in git the same day.

Secrets, cron targets, and env-specific values stay out of committed SQL except placeholders.

## Required workflow for future migrations

```text
1. Branch from main
2. npx supabase migration new <description>
3. Edit only the new file under supabase/migrations/
4. npm run db:migrations:validate
5. Apply locally (supabase db reset or targeted apply) and smoke-test
6. Open PR — CI runs migration-governance workflow
7. Merge → apply to staging/production via approved ops path
```

### Validation command

```bash
npm run db:migrations:validate
```

CI: `.github/workflows/migration-governance.yml` runs the same script on PRs/pushes that touch migrations or the validator.

## What this does *not* do

- Does not modify baseline SQL contents.
- Does not repair remote `schema_migrations` history by itself.
- Does not delete or rewrite `migrations-legacy`.

## References

- Baseline process: `docs/database-baseline/local-replay-verification.md`
- Processed draft review (historical): `docs/database-baseline/processed-baseline-review.md`
- Backend workers architecture: `docs/backend-migration-architecture.md`
