-- Paystack payout transfer support.
-- Transfers are an execution step for approved cleaner_payouts, not the source of truth.

alter table public.cleaner_payouts add column if not exists payment_reference text;
alter table public.cleaner_payouts add column if not exists payment_status text not null default 'pending';

alter table public.cleaner_payouts drop constraint if exists cleaner_payouts_payment_status_check;
alter table public.cleaner_payouts
  add constraint cleaner_payouts_payment_status_check
  check (payment_status in ('pending', 'processing', 'success', 'failed', 'partial_failed'));

create table if not exists public.cleaner_payment_details (
  cleaner_id uuid primary key references public.cleaners (id) on delete cascade,
  account_number text not null,
  bank_code text not null,
  recipient_code text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payout_transfers (
  id uuid primary key default gen_random_uuid(),
  payout_id uuid not null references public.cleaner_payouts (id) on delete cascade,
  cleaner_id uuid not null references public.cleaners (id) on delete cascade,
  amount_cents integer not null check (amount_cents > 0),
  recipient_code text,
  transfer_code text,
  status text not null check (status in ('processing', 'success', 'failed')),
  error text,
  webhook_payload jsonb,
  webhook_processed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.payout_transfers add column if not exists webhook_payload jsonb;
alter table public.payout_transfers add column if not exists webhook_processed_at timestamptz;

alter table public.payout_transfers drop constraint if exists payout_transfers_status_check;
alter table public.payout_transfers
  add constraint payout_transfers_status_check
  check (status in ('processing', 'success', 'failed'));

create index if not exists payout_transfers_payout_id_idx on public.payout_transfers (payout_id);
create index if not exists payout_transfers_cleaner_id_idx on public.payout_transfers (cleaner_id);
create unique index if not exists payout_transfers_transfer_code_idx
  on public.payout_transfers (transfer_code)
  where transfer_code is not null;
create unique index if not exists payout_transfers_success_once_idx
  on public.payout_transfers (payout_id)
  where status = 'success';

alter table public.cleaner_payment_details enable row level security;
alter table public.payout_transfers enable row level security;

comment on column public.cleaner_payouts.payment_reference is 'Paystack transfer code/reference for the approved payout batch.';
comment on column public.cleaner_payouts.payment_status is 'Paystack execution state; payout status remains the source of truth.';
comment on column public.payout_transfers.webhook_payload is 'Last verified Paystack webhook payload received for this transfer.';
comment on column public.payout_transfers.webhook_processed_at is 'Server timestamp when the last verified Paystack webhook was processed for this transfer.';
comment on table public.cleaner_payment_details is 'Cleaner bank details used by server-side payout transfer code. No client RLS policies by default.';
comment on table public.payout_transfers is 'Audit log of Paystack payout transfer attempts. No client RLS policies by default.';
