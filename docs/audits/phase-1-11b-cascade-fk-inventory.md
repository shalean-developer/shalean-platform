# Phase 1.11B — CASCADE foreign key inventory (financial / historical)

**Status:** AUDIT + COMMENT ONLY — no ON DELETE changes applied  
**Source:** `supabase/migrations/20260714010000_production_baseline.sql`  
**Metadata migration:** `20260714120400_phase_111b_cascade_fk_audit_comments.sql`

## ⚠️ High-lock warning

Rewriting `ON DELETE CASCADE` requires `DROP CONSTRAINT` + `ADD CONSTRAINT`, which takes `ACCESS EXCLUSIVE` locks on child (and often parent) tables. **Do not run the proposed SQLs below against production without a maintenance window and finance approval.**

## Priority RESTRICT candidates (ledger destruction risk)

| Constraint | Child | Parent | Current | Proposed |
|------------|-------|--------|---------|----------|
| `cleaner_earnings_booking_id_fkey` | `cleaner_earnings` | `bookings` | CASCADE | **RESTRICT** |
| `cleaner_earnings_cleaner_id_fkey` | `cleaner_earnings` | `cleaners` | CASCADE | **RESTRICT** |
| `cleaner_payouts_cleaner_id_fkey` | `cleaner_payouts` | `cleaners` | CASCADE | **RESTRICT** |
| `monthly_invoices_customer_id_fkey` | `monthly_invoices` | `auth.users` | CASCADE | **RESTRICT** |
| `cleaning_credit_transactions_user_id_fkey` | `cleaning_credit_transactions` | `auth.users` | CASCADE | **RESTRICT** |
| `payout_transfers_cleaner_id_fkey` | `payout_transfers` | `cleaners` | CASCADE | **RESTRICT** |
| `payout_transfers_payout_id_fkey` | `payout_transfers` | `cleaner_payouts` | CASCADE | Review (CASCADE vs RESTRICT) |
| `invoice_adjustments_customer_id_fkey` | `invoice_adjustments` | `auth.users` | CASCADE | **RESTRICT** |

## Likely keep CASCADE (child artifacts of booking)

| Constraint | Notes |
|------------|-------|
| `booking_line_items_booking_id_fkey` | Line items typically die with booking |
| `booking_cleaner_earnings_snapshot_*` | Snapshot of booking; CASCADE usually OK |
| `booking_roster_member_payouts_booking_id_fkey` | Booking-scoped |
| `team_job_member_payouts_booking_id_fkey` | Booking-scoped |
| `monthly_invoice_events_invoice_id_fkey` | Events of invoice; OK if invoice RESTRICT first |

## Proposed future migration pattern (NOT shipped)

```sql
-- HIGH-LOCK — example only; do not apply without approval
ALTER TABLE public.cleaner_earnings
  DROP CONSTRAINT cleaner_earnings_cleaner_id_fkey,
  ADD CONSTRAINT cleaner_earnings_cleaner_id_fkey
    FOREIGN KEY (cleaner_id) REFERENCES public.cleaners(id)
    ON DELETE RESTRICT;
```

Repeat per approved constraint. Soft-delete cleaner/user patterns in app code must be verified first.

## Rollback of comments migration

Comments are additive. To clear: `COMMENT ON CONSTRAINT … IS NULL;`
