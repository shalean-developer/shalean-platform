-- Admin-editable Zoho/document invoice date (defaults to 1st of billing month when null).

alter table public.monthly_invoices
  add column if not exists invoice_date date;

comment on column public.monthly_invoices.invoice_date is
  'Optional document/billing date shown on Zoho. When null, Zoho uses the 1st of month.';
