-- Security hardening for the canonical refund ledger.
-- Runtime refund/accounting code uses the server-side service-role client.
-- Browser roles must not be able to read or mutate this finance ledger directly.

alter table public.refund_accounting_records enable row level security;

revoke all on table public.refund_accounting_records from anon, authenticated;
grant all on table public.refund_accounting_records to service_role;

comment on table public.refund_accounting_records is
  'Canonical refund ledger for booking, monthly invoice, and sales-document refunds. Server/service-role only; provider reversal and accounting/Zoho reconciliation are tracked independently.';
