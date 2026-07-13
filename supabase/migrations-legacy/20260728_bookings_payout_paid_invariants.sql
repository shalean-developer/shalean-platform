-- Enforce: paid bookings always have payout_paid_at and payout_run_id (backfill legacy rows first).
update public.bookings
set payout_paid_at = now()
where payout_status = 'paid'
  and payout_paid_at is null;

update public.bookings
set payout_run_id = gen_random_uuid()
where payout_status = 'paid'
  and payout_run_id is null;

alter table public.bookings drop constraint if exists bookings_paid_requires_timestamp;
alter table public.bookings
  add constraint bookings_paid_requires_timestamp
  check (payout_status <> 'paid' or payout_paid_at is not null);

comment on constraint bookings_paid_requires_timestamp on public.bookings is
  'paid rows must record when payout was marked (prevents silent trust breaks).';

alter table public.bookings drop constraint if exists bookings_paid_requires_run_id;
alter table public.bookings
  add constraint bookings_paid_requires_run_id
  check (payout_status <> 'paid' or payout_run_id is not null);

comment on constraint bookings_paid_requires_run_id on public.bookings is
  'paid rows must carry a batch/run id for reconciliation (admin RPC sets this).';
