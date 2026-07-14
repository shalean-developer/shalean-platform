-- Phase 1.11B — P1: CASCADE FK audit metadata ONLY (no constraint changes)
-- Audit: F-DATA-001
--
-- FLAGGED: Changing ON DELETE CASCADE → RESTRICT/NO ACTION is HIGH-LOCK and can
-- break intentional delete flows. This migration only documents risk via COMMENT.
-- Proposed ALTER TABLE ... DROP CONSTRAINT / ADD CONSTRAINT scripts live in:
--   docs/audits/phase-1-11b-cascade-fk-inventory.md
-- Do NOT apply CASCADE rewrites until finance/ops approve that inventory.

BEGIN;

COMMENT ON CONSTRAINT cleaner_earnings_booking_id_fkey ON public.cleaner_earnings IS
  'AUDIT Phase 1.11B: ON DELETE CASCADE — deleting a booking destroys earnings ledger rows. Proposed: RESTRICT (pending approval).';
COMMENT ON CONSTRAINT cleaner_earnings_cleaner_id_fkey ON public.cleaner_earnings IS
  'AUDIT Phase 1.11B: ON DELETE CASCADE — deleting a cleaner destroys earnings ledger. Proposed: RESTRICT (pending approval).';
COMMENT ON CONSTRAINT cleaner_payouts_cleaner_id_fkey ON public.cleaner_payouts IS
  'AUDIT Phase 1.11B: ON DELETE CASCADE — deleting a cleaner destroys payout history. Proposed: RESTRICT (pending approval).';
COMMENT ON CONSTRAINT monthly_invoices_customer_id_fkey ON public.monthly_invoices IS
  'AUDIT Phase 1.11B: ON DELETE CASCADE — deleting auth.users destroys invoices. Proposed: RESTRICT (pending approval).';
COMMENT ON CONSTRAINT cleaning_credit_transactions_user_id_fkey ON public.cleaning_credit_transactions IS
  'AUDIT Phase 1.11B: ON DELETE CASCADE — deleting auth.users destroys credit ledger. Proposed: RESTRICT (pending approval).';
COMMENT ON CONSTRAINT booking_line_items_booking_id_fkey ON public.booking_line_items IS
  'AUDIT Phase 1.11B: ON DELETE CASCADE with booking — usually desirable for drafts; review before RESTRICT.';
COMMENT ON CONSTRAINT payout_transfers_payout_id_fkey ON public.payout_transfers IS
  'AUDIT Phase 1.11B: ON DELETE CASCADE when parent cleaner_payouts deleted — review retention needs.';
COMMENT ON CONSTRAINT monthly_invoice_events_invoice_id_fkey ON public.monthly_invoice_events IS
  'AUDIT Phase 1.11B: ON DELETE CASCADE with monthly_invoices — event trail lost with invoice.';
COMMENT ON CONSTRAINT invoice_adjustments_customer_id_fkey ON public.invoice_adjustments IS
  'AUDIT Phase 1.11B: ON DELETE CASCADE with auth.users — review before customer hard-delete.';
COMMENT ON CONSTRAINT payout_transfers_cleaner_id_fkey ON public.payout_transfers IS
  'AUDIT Phase 1.11B: ON DELETE CASCADE with cleaners — transfer history at risk.';
COMMENT ON CONSTRAINT payout_transfer_outbox_cleaner_id_fkey ON public.payout_transfer_outbox IS
  'AUDIT Phase 1.11B: ON DELETE CASCADE with cleaners.';
COMMENT ON CONSTRAINT earnings_disbursement_transfers_cleaner_id_fkey ON public.earnings_disbursement_transfers IS
  'AUDIT Phase 1.11B: ON DELETE CASCADE with cleaners.';
COMMENT ON CONSTRAINT cleaner_earnings_disbursements_cleaner_id_fkey ON public.cleaner_earnings_disbursements IS
  'AUDIT Phase 1.11B: ON DELETE CASCADE with cleaners.';
COMMENT ON CONSTRAINT cleaner_earnings_adjustments_booking_id_fkey ON public.cleaner_earnings_adjustments IS
  'AUDIT Phase 1.11B: ON DELETE CASCADE with bookings.';
COMMENT ON CONSTRAINT cleaner_earnings_adjustments_cleaner_id_fkey ON public.cleaner_earnings_adjustments IS
  'AUDIT Phase 1.11B: ON DELETE CASCADE with cleaners.';
COMMENT ON CONSTRAINT cleaner_earnings_disputes_booking_id_fkey ON public.cleaner_earnings_disputes IS
  'AUDIT Phase 1.11B: ON DELETE CASCADE with bookings.';
COMMENT ON CONSTRAINT cleaner_earnings_disputes_cleaner_id_fkey ON public.cleaner_earnings_disputes IS
  'AUDIT Phase 1.11B: ON DELETE CASCADE with cleaners.';
COMMENT ON CONSTRAINT booking_roster_member_payouts_booking_id_fkey ON public.booking_roster_member_payouts IS
  'AUDIT Phase 1.11B: ON DELETE CASCADE with bookings.';
COMMENT ON CONSTRAINT team_job_member_payouts_booking_id_fkey ON public.team_job_member_payouts IS
  'AUDIT Phase 1.11B: ON DELETE CASCADE with bookings.';
COMMENT ON CONSTRAINT booking_cleaner_earnings_snapshot_booking_id_fkey ON public.booking_cleaner_earnings_snapshot IS
  'AUDIT Phase 1.11B: ON DELETE CASCADE with bookings.';
COMMENT ON CONSTRAINT admin_earnings_actions_booking_id_fkey ON public.admin_earnings_actions IS
  'AUDIT Phase 1.11B: ON DELETE CASCADE with bookings.';

COMMIT;
