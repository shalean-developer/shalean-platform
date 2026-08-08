-- P3 Finance lifecycle gaps: unified refund and credit-note accounting.
-- Durable refund facts live here; accounting_sync_records remains the retry queue.

create table if not exists public.refund_accounting_records (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('booking', 'monthly_invoice', 'sales_document')),
  entity_id uuid not null,
  payment_transaction_id uuid references public.payment_transactions(id) on delete set null,
  provider text not null default 'paystack' check (provider in ('paystack', 'manual')),
  charge_reference text,
  refund_reference text not null,
  refund_key text not null unique,
  amount_cents bigint not null check (amount_cents > 0),
  currency_code text not null default 'ZAR',
  refund_status text not null default 'succeeded' check (refund_status in ('pending', 'succeeded', 'failed', 'cancelled')),
  refunded_at timestamptz not null default now(),
  reason text,
  zoho_invoice_id text,
  zoho_credit_note_id text,
  zoho_credit_note_number text,
  accounting_status text not null default 'pending' check (accounting_status in ('pending', 'synced', 'failed', 'not_applicable')),
  accounting_error text,
  accounting_synced_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists refund_accounting_records_entity_idx
  on public.refund_accounting_records(entity_type, entity_id, refunded_at desc);

create index if not exists refund_accounting_records_accounting_status_idx
  on public.refund_accounting_records(accounting_status, refunded_at);

create unique index if not exists refund_accounting_records_provider_reference_idx
  on public.refund_accounting_records(provider, refund_reference)
  where refund_reference <> '';

comment on table public.refund_accounting_records is
  'Canonical refund ledger for booking, monthly invoice, and sales-document refunds. Provider reversal and accounting/Zoho reconciliation are tracked independently.';
