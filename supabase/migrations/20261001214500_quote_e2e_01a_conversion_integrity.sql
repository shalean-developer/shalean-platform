-- QUOTE-E2E-01A — conversion integrity.
--
-- Enforce the application invariant that one quote can produce at most one
-- sales-document invoice. Existing production data was audited before this
-- migration: no quote currently has more than one converted invoice.

create unique index if not exists sales_documents_one_invoice_per_quote_idx
  on public.sales_documents (converted_from_id)
  where document_type = 'invoice'
    and converted_from_id is not null;

comment on index public.sales_documents_one_invoice_per_quote_idx is
  'QUOTE-E2E-01A: prevents concurrent/repeated quote acceptance from creating multiple invoices for the same quote.';
