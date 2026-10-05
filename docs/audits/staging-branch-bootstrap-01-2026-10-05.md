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

Supabase created the branch infrastructure successfully, but the native migration replay reported `MIGRATIONS_FAILED` and initially produced:

- 0 public tables
- 0 public functions
- 0 migration-ledger rows

The production project is healthy, but its Supabase migration ledger only contains the more recent governed migrations and is not sufficient by itself to reconstruct the entire historical Shalean schema on a blank branch.

## Controlled bootstrap proof

The active repository migration chain was replayed against the isolated branch, beginning with the sanitized non-production production baseline:

`supabase/migrations/20260714010000_production_baseline.sql`

The baseline is explicitly approved for isolated non-production bootstrap and contains schema only.

After replay:

- staging public tables: 257 before retirement cleanup
- production public tables: 257
- staging public functions: 164
- production public functions: 164
- function signature inventory matched
- RLS policy signature inventory matched
- auth users on staging: 0
- bookings on staging: 0
- customers on staging: 0
- cleaner payouts on staging: 0

The only schema inventory differences were:

1. staging contained the two historically prepared recurring-prepayment tables that production intentionally never adopted;
2. production contains two historical blog draft backup tables that the sanitized non-production baseline intentionally excludes.

The recurring-prepayment tables are retired by the governed idempotent migration added with this stage.

The production-only blog draft backup tables remain excluded from staging by design.

## Safety decision

Do not point `pricing-test.shalean.co.za` at the branch until:

1. the bootstrap convergence migration is merged;
2. the branch-specific Supabase URL, publishable/anon key, and service-role key are configured in the staging hosting environment;
3. `/api/health/environment` reports branch ref `uwvnmluiqbczeduzjgse`;
4. staging auth and booking smoke tests pass.

No production data was copied or modified during branch bootstrap.
