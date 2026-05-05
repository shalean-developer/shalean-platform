-- Explicit partial unique index for paystack_reference (non-null rows only).
-- Table bootstrap already has UNIQUE on paystack_reference (20260700_monthly_billing_invoices.sql); this index is
-- redundant for enforcement but named for ops visibility and matches common partial-index patterns.

CREATE UNIQUE INDEX IF NOT EXISTS idx_monthly_invoices_paystack_reference_unique
ON public.monthly_invoices (paystack_reference)
WHERE paystack_reference IS NOT NULL;
