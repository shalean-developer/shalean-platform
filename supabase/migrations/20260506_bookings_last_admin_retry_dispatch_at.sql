-- Rate-limit + audit anchor for admin “retry dispatch” API.
alter table public.bookings
  add column if not exists last_admin_retry_dispatch_at timestamptz;

comment on column public.bookings.last_admin_retry_dispatch_at is
  'Set when an admin triggers POST /api/admin/bookings/:id/retry-dispatch; enforces per-booking cooldown.';
