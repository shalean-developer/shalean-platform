-- Allow cancelling pending lifecycle jobs when the booking is cancelled (no more emails).
alter table public.booking_lifecycle_jobs drop constraint if exists booking_lifecycle_jobs_status_check;

alter table public.booking_lifecycle_jobs
  add constraint booking_lifecycle_jobs_status_check
  check (status in ('pending', 'sent', 'failed', 'cancelled'));
