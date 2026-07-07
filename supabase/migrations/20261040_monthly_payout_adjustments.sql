-- Monthly payout manual adjustments: track calculated vs paid amount before approval.

alter table public.cleaner_payouts
  add column if not exists calculated_amount_cents integer,
  add column if not exists adjustment_note text,
  add column if not exists amount_adjusted_at timestamptz,
  add column if not exists amount_adjusted_by uuid;

update public.cleaner_payouts
set calculated_amount_cents = total_amount_cents
where calculated_amount_cents is null;

comment on column public.cleaner_payouts.calculated_amount_cents is
  'Auto-sum from linked bookings at batch creation; immutable after insert.';
comment on column public.cleaner_payouts.adjustment_note is
  'Admin note when total_amount_cents was manually changed before approval.';
comment on column public.cleaner_payouts.amount_adjusted_at is
  'When an admin last edited total_amount_cents on a pending/frozen batch.';
comment on column public.cleaner_payouts.amount_adjusted_by is
  'Admin user who last edited total_amount_cents on a pending/frozen batch.';
