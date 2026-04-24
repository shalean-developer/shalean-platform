-- Backoff + lease for user-selected recovery (cron vs realtime / overlapping ticks).
alter table public.bookings
  add column if not exists dispatch_next_recovery_at timestamptz;

alter table public.bookings
  add column if not exists dispatch_recovery_lease_until timestamptz;

comment on column public.bookings.dispatch_next_recovery_at is
  'Earliest time cron may start another user-selected recovery wave after the last wave (backoff).';

comment on column public.bookings.dispatch_recovery_lease_until is
  'Short lease while a worker runs recovery for this booking; prevents duplicate redispatch in the same cron tick.';

create index if not exists bookings_dispatch_next_recovery_at_idx
  on public.bookings (dispatch_next_recovery_at asc nulls first)
  where status = 'pending'
    and cleaner_id is null
    and assignment_type = 'user_selected';
