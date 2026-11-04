-- Schema compatibility for monthly-invoice void. Review as a migration before production.
-- Staging first. The invoice total remains historical; balance becomes zero.
ALTER TABLE public.monthly_invoices DROP CONSTRAINT IF EXISTS monthly_invoices_status_check;
ALTER TABLE public.monthly_invoices ADD CONSTRAINT monthly_invoices_status_check
  CHECK (status IN ('draft','sent','partially_paid','paid','overdue','refunded','void'));
