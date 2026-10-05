# SHALEAN-E2E-MASTER-00B — Database security / RLS convergence closeout

Date closed: 2026-10-05  
Scope closed: MASTER-00B-01 through MASTER-00B-07  
Status: PASS after governed repository/production migration-history reconciliation for MASTER-00B-07.

## Stage-gate rule followed

Each item was handled as:

Audit → identify defect → prove source of truth → fix → add regression test → staging → verify → merge → production → reconcile → close.

No item was intentionally promoted to production before its staging proof was complete.

## Closed items

| Item | Scope | Result |
| --- | --- | --- |
| MASTER-00B-01 | `cleaning_credit_reservations` RLS/service-role boundary | PASS |
| MASTER-00B-02 | `blog_is_admin()` search_path hardening | PASS |
| MASTER-00B-03 | `prevent_admin_audit_mutation()` search_path hardening | PASS |
| MASTER-00B-04 | `assign_booking_reference()` search_path hardening | PASS |
| MASTER-00B-05 | `bookings_trg_ensure_payout_owner_in_team()` search_path hardening | PASS |
| MASTER-00B-06 | `bookings_trg_payout_frozen_immutable_after_eligible()` search_path hardening | PASS |
| MASTER-00B-07 | `cleaner_payouts_block_mutate_when_frozen()` search_path hardening | PASS after migration-history reconciliation |

## MASTER-00B-07 migration-history reconciliation

Production Supabase project:

`paqjwfulwywtsyyvdxrq` (`shalean-production`)

The effective production schema is correct and reconciled:

- `public.cleaner_payouts_block_mutate_when_frozen()`
- `search_path=pg_catalog`
- `SECURITY INVOKER` unchanged
- volatility remains `VOLATILE`
- trigger remains `BEFORE UPDATE` on `public.cleaner_payouts`
- no duplicate trigger, function, table, or payout-row mutation was created

Production had recorded the hardening twice under these migration versions:

- `20261005010028` — `master_00b_07_cleaner_payouts_search_path`
- `20261005010036` — `master_00b_07_cleaner_payouts_search_path`

The repository originally contained an unmatched local-only version:

- `20261005014500_master_00b_07_cleaner_payouts_search_path.sql`

That timestamp mismatch could cause future Supabase migration-history synchronization failures even though the effective schema was correct.

### Governed reconciliation

The repository migration history was aligned to production without deleting or rewriting production migration-history rows:

- `20261005010028_master_00b_07_cleaner_payouts_search_path.sql` is an intentional no-op history mirror for the first production ledger version.
- `20261005010036_master_00b_07_cleaner_payouts_search_path_reconcile.sql` is an intentional no-op history mirror for the second production ledger version.
- `20261005014500_master_00b_07_cleaner_payouts_search_path.sql` is preserved as the published forward, idempotent schema-hardening migration.
- the MASTER-00B-07 regression contract points to the published forward version `20261005014500`.

This accounts for all three known timestamps without deleting or rewriting production migration history. On production, a future migration sync can recognize the two already-recorded timestamps and safely apply the still-forward `20261005014500` mutation idempotently if it has not yet been recorded there.

### Staging note

The staging project `jhubpsbwmjgydkzztxeu` received the 00B-07 DDL manually because its current Supabase plan blocks connector migration writes. At closeout, no 00B-07 ledger rows were present there. This is an explicit staging-environment limitation and must be reconciled if/when staging migration-ledger writes become available before using automated migration-history synchronization against staging.

### Regression rule going forward

Never reuse the same migration name for a new migration application. Every governed migration should have a unique timestamp/version and a repository entry that can be reconciled against the target environment's ledger.

## Final production evidence for MASTER-00B-07

Production source SHA:

`ae7457fc20dc259a07ca42aebffe418b468d9af3`

Production deployment artifact:

`f02085f14b3bb5bba3ba40295bbc602e86d834a2`

Artifact provenance message:

`deploy: production ae7457fc20dc259a07ca42aebffe418b468d9af3`

Final reconciliation showed:

- production health `status=ok`
- production Supabase ref = `paqjwfulwywtsyyvdxrq`
- Paystack = live/live
- production issues = `[]`
- `main` and `production` had no file-content differences at closeout; production was ahead only by governed merge commits
- `cleaner_payouts_block_mutate_when_frozen()` had `search_path=pg_catalog`

## Closeout decision

MASTER-00B-01 through MASTER-00B-07 are closed.

The MASTER-00B-07 repository now accounts for both recorded production timestamps and preserves the published forward `20261005014500` migration. The staging ledger limitation remains explicitly documented and is not a production blocker.
