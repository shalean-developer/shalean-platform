-- One active (pending) retry row per booking — hard guard against queue explosion.
-- Replaces legacy index name with canonical name (same predicate as 20260436).

drop index if exists public.dispatch_retry_queue_booking_pending_uidx;

create unique index if not exists uniq_active_retry_per_booking
  on public.dispatch_retry_queue (booking_id)
  where (status = 'pending');

comment on index public.uniq_active_retry_per_booking is
  'At most one pending dispatch_retry_queue row per booking (concurrent enqueue safety).';
