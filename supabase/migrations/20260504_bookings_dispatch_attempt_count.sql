-- Tracks redispatch waves after user-selected offer decline/timeout (caps infinite retries).
alter table public.bookings
  add column if not exists dispatch_attempt_count smallint not null default 0;

comment on column public.bookings.dispatch_attempt_count is
  'Increments on each user-selected offer recovery (decline/expire → re-dispatch); capped by MAX_DISPATCH_ATTEMPTS.';

create index if not exists bookings_dispatch_attempt_pending_idx
  on public.bookings (dispatch_attempt_count)
  where status = 'pending' and cleaner_id is null and assignment_type = 'user_selected';
