-- Soft lock for concurrent finalize workers sending the same initial payment-link email.
-- Uniqueness of non-null paystack_reference is already enforced by column UNIQUE (20260700_monthly_billing_invoices.sql).

alter table public.monthly_invoices
  add column if not exists initial_invoice_email_dispatch_claimed boolean not null default false;

comment on column public.monthly_invoices.initial_invoice_email_dispatch_claimed is
  'Finalize cron: claimed before Resend send; cleared on send failure. Prevents duplicate first emails under concurrent finalize.';

comment on column public.monthly_invoices.paystack_reference is
  'Paystack transaction reference; UNIQUE when not null. Persisted before initialize call for crash-safe retries (see initializePaystackForMonthlyInvoice).';
