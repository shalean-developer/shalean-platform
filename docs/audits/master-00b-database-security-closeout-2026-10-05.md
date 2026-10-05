# SHALEAN-E2E-MASTER-00B — Database security / RLS convergence closeout

Date closed: 2026-10-05  
Scope closed: MASTER-00B-01 through MASTER-00B-07  
Status: PASS, with one governed migration-ledger metadata exception on MASTER-00B-07.

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
| MASTER-00B-07 | `cleaner_payouts_block_mutate_when_frozen()` search_path hardening | PASS with governed migration-ledger metadata exception |

## MASTER-00B-07 governed migration-ledger metadata exception

Production Supabase project:

`paqjwfulwywtsyyvdxrq` (`shalean-production`)

The effective production schema is correct and reconciled:

- `public.cleaner_payouts_block_mutate_when_frozen()`
- `search_path=pg_catalog`
- `SECURITY INVOKER` unchanged
- volatility remains `VOLATILE`
- trigger remains `BEFORE UPDATE` on `public.cleaner_payouts`
- no duplicate trigger, function, table, or payout-row mutation was created by the duplicate migration execution

The Supabase migration ledger contains two rows with the same migration name:

- version `20261005010028` — `master_00b_07_cleaner_payouts_search_path`
- version `20261005010036` — `master_00b_07_cleaner_payouts_search_path`

This is classified as a **governed migration-ledger metadata exception**, not active schema drift.

### Required handling

Do not delete or rewrite either Supabase migration-history row manually.

Reason:

- the migration SQL is idempotent
- effective schema state is correct
- there is no duplicate database object or data side effect
- rewriting migration history introduces more risk than retaining the harmless historical metadata anomaly

Future audits should treat these two ledger rows as one known historical exception and should verify the effective schema state rather than flagging this pair as unexplained drift.

### Regression rule going forward

Never reuse the same migration name for a new migration application. Every new migration must use a unique timestamp/version and unique migration name.

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

The MASTER-00B-07 duplicate ledger-name/version pair is retained as a documented historical metadata exception and is not a blocker for moving to the next SHALEAN-E2E-MASTER stage.
