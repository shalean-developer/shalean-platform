-- Allow an audited non-collectible monthly invoice state without treating a void as a payment or refund.
-- Historical total/paid fields and generated balance remain unchanged.
-- Deliberately no data updates, Paystack charges, Zoho calls or notifications.
ALTER TABLE public.monthly_invoices
  DROP CONSTRAINT IF EXISTS monthly_invoices_status_check;
ALTER TABLE public.monthly_invoices
  ADD CONSTRAINT monthly_invoices_status_check
  CHECK (status IN ('draft','sent','partially_paid','paid','overdue','refunded','void'));
