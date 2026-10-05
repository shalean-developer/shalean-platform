# STAGING-BRANCH-BOOTSTRAP-01 — production-derived Supabase staging branch

Date: 2026-10-05

## Goal

Create a safe Supabase development branch under production project `paqjwfulwywtsyyvdxrq` for `pricing-test.shalean.co.za` without copying production customer data.

## Branch

- Parent production project: `paqjwfulwywtsyyvdxrq`
- Staging branch project ref: `uwvnmluiqbczeduzjgse`
- Branch name: `staging`
- Production data copied: no

## Native branch creation finding

Supabase created the branch infrastructure successfully, but native migration replay initially reported `MIGRATIONS_FAILED` and produced no Shalean public schema. The production project's Supabase migration ledger only contains newer governed migrations and is not sufficient by itself to rebuild the historical schema from a blank branch.

## Controlled bootstrap proof

The active repository migration chain was replayed against the isolated branch, beginning with the sanitized non-production baseline:

`supabase/migrations/20260714010000_production_baseline.sql`

The baseline is explicitly approved for isolated non-production bootstrap and contains schema only.

After replay:

- staging public functions: 164
- production public functions: 164
- function signature inventory matched
- RLS policy signature inventory matched
- auth users on staging: 0
- bookings on staging: 0
- customers on staging: 0
- cleaner payouts on staging: 0

Production contains two historical blog draft backup tables that the sanitized non-production baseline intentionally excludes.

## Critical recurring-prepayment finding

Fresh Codex review identified that the first convergence attempt was unsafe because it dropped `recurring_prepaid_packages` and `recurring_prepaid_allocations`.

Runtime inspection proved those tables are still required by:

- Booking V2 recurring checkout
- recurring prepayment activation/allocation
- pending-payment edit abandonment
- booking refund handling

Production logs then provided direct evidence of repeated HTTP 404s against both missing relations.

Therefore the source of truth is now:

**the recurring prepayment ledger is required runtime schema and must exist.**

The branch was immediately restored with the historical idempotent schema migration and remains empty of production row data. The governed convergence migration in this PR now creates/preserves the required ledger rather than dropping it.

## Safety decision

Do not point `pricing-test.shalean.co.za` at the branch until:

1. this corrected migration is green and merged;
2. the branch-specific Supabase URL, publishable/anon key, and service-role key are configured in staging hosting;
3. `/api/health/environment` reports branch ref `uwvnmluiqbczeduzjgse`;
4. staging auth, recurring checkout, and booking smoke tests pass.

No production customer data was copied or modified during branch bootstrap.
