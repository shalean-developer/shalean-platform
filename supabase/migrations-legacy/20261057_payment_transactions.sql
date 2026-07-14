-- Gateway-agnostic payment transaction ledger with Paystack fee tracking and expense linkage.

-- ---------------------------------------------------------------------------
-- Payment transactions (multi-gateway ready)
-- ---------------------------------------------------------------------------
create table if not exists public.payment_transactions (
  id uuid primary key default gen_random_uuid(),
  gateway text not null check (gateway in ('paystack', 'peach', 'stripe', 'other')),
  gateway_reference text not null,
  gateway_transaction_id text,
  entity_type text not null check (entity_type in ('booking', 'monthly_invoice', 'sales_document')),
  entity_id uuid not null,
  amount_cents integer not null check (amount_cents > 0),
  currency_code text not null default 'ZAR',
  processing_fee_cents integer not null default 0 check (processing_fee_cents >= 0),
  processing_fee_vat_cents integer check (processing_fee_vat_cents is null or processing_fee_vat_cents >= 0),
  net_settlement_cents integer not null check (net_settlement_cents >= 0),
  fee_calculation_method text not null check (fee_calculation_method in (
    'paystack_reported',
    'calculated_sa_local_card',
    'calculated_sa_international_card',
    'calculated_sa_eft',
    'calculated_sa_default',
    'manual'
  )),
  settlement_status text not null default 'pending' check (settlement_status in (
    'pending', 'settled', 'failed', 'reversed'
  )),
  settlement_date date,
  payment_channel text,
  expense_id uuid references public.expenses (id) on delete set null,
  booking_id uuid references public.bookings (id) on delete set null,
  raw_gateway_payload jsonb,
  paid_at timestamptz,
  external_accounting_id text,
  sync_status text not null default 'not_synced'
    check (sync_status in ('not_synced', 'pending', 'synced', 'failed')),
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (gateway, gateway_reference)
);

create index if not exists payment_transactions_entity_idx
  on public.payment_transactions (entity_type, entity_id);

create index if not exists payment_transactions_paid_at_idx
  on public.payment_transactions (paid_at desc nulls last);

create index if not exists payment_transactions_settlement_idx
  on public.payment_transactions (settlement_status, settlement_date);

create index if not exists payment_transactions_booking_idx
  on public.payment_transactions (booking_id)
  where booking_id is not null;

comment on table public.payment_transactions is
  'Gateway payment ledger: gross amount, processing fee, net settlement. Multi-gateway (Paystack, Peach, Stripe).';

-- Optional quick link from bookings
alter table public.bookings
  add column if not exists payment_transaction_id uuid references public.payment_transactions (id) on delete set null;

create index if not exists bookings_payment_transaction_idx
  on public.bookings (payment_transaction_id)
  where payment_transaction_id is not null;

-- Link expenses back to payment transaction
alter table public.expenses
  add column if not exists payment_transaction_id uuid references public.payment_transactions (id) on delete set null;

create unique index if not exists expenses_payment_transaction_uidx
  on public.expenses (payment_transaction_id)
  where payment_transaction_id is not null;

-- ---------------------------------------------------------------------------
-- RLS: service role only
-- ---------------------------------------------------------------------------
alter table public.payment_transactions enable row level security;

create policy payment_transactions_deny on public.payment_transactions
  for all to authenticated using (false);
