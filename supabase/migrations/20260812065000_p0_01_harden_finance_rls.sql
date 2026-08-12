-- P0-01: harden service-role-only finance tables exposed through public schema.
--
-- Both tables were created without RLS, while Supabase default grants gave anon
-- and authenticated roles broad table privileges. These tables contain internal
-- accounting/billing control data and are not intended for direct client access.

-- ---------------------------------------------------------------------------
-- refund_accounting_records: internal refund/accounting ledger
-- ---------------------------------------------------------------------------
alter table public.refund_accounting_records enable row level security;

revoke all privileges on table public.refund_accounting_records from anon, authenticated;

-- Keep an explicit deny policy so the table's client-access intent remains clear
-- and Supabase's RLS-with-no-policy advisor does not flag it as accidental.
drop policy if exists refund_accounting_records_client_deny on public.refund_accounting_records;
create policy refund_accounting_records_client_deny
  on public.refund_accounting_records
  for all
  to anon, authenticated
  using (false)
  with check (false);

-- ---------------------------------------------------------------------------
-- customer_monthly_billing_terms: internal monthly-billing control table
-- ---------------------------------------------------------------------------
alter table public.customer_monthly_billing_terms enable row level security;

revoke all privileges on table public.customer_monthly_billing_terms from anon, authenticated;

drop policy if exists customer_monthly_billing_terms_client_deny on public.customer_monthly_billing_terms;
create policy customer_monthly_billing_terms_client_deny
  on public.customer_monthly_billing_terms
  for all
  to anon, authenticated
  using (false)
  with check (false);

comment on table public.refund_accounting_records is
  'Canonical internal refund ledger. Direct anon/authenticated access is denied; server-side service-role access only.';

comment on table public.customer_monthly_billing_terms is
  'Internal monthly billing due-day configuration. Direct anon/authenticated access is denied; server-side/service-role access only.';
