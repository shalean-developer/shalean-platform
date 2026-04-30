-- Run-level Paystack metadata (per-cleaner execution still uses cleaner_payouts.payment_* + payout_transfers).

alter table public.cleaner_payout_runs add column if not exists paystack_batch_ref text;

comment on column public.cleaner_payout_runs.paystack_batch_ref is
  'Stable idempotency key / batch label for this disbursement run (not Paystack transfer_code).';

-- Allow saving bank details before Paystack recipient exists; server creates recipient on first payout.
alter table public.cleaner_payment_details alter column recipient_code drop not null;
