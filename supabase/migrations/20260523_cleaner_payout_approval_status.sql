-- Add a review gate before cleaner payout batches can be marked paid.

alter table public.cleaner_payouts add column if not exists approved_at timestamptz;
alter table public.cleaner_payouts add column if not exists approved_by uuid;

alter table public.cleaner_payouts drop constraint if exists cleaner_payouts_status_check;
alter table public.cleaner_payouts
  add constraint cleaner_payouts_status_check
  check (status in ('pending', 'approved', 'paid', 'cancelled'));

comment on column public.cleaner_payouts.approved_at is 'Set when an admin approves this payout batch for payment.';
comment on column public.cleaner_payouts.approved_by is 'Auth user id of the admin who approved this payout batch.';
