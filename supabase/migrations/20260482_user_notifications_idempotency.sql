-- Idempotency: one in-app row per (user, booking, type) for lifecycle types.
-- If this migration fails, dedupe existing rows (same user_id, booking_id, type) first, then re-run.
-- Optional later: backfill `bookings.price_breakdown.job` for legacy rows (admin script / job) so customer + cleaner UIs always show split lines.
-- Prevents duplicate assigned/confirmed/reminder rows when parallel jobs or retries
-- land outside the 3-minute soft dedupe window. `system` is excluded so multiple
-- booking-scoped system messages can still exist if needed.
create unique index if not exists user_notifications_idempotency_user_booking_type_key
  on public.user_notifications (user_id, booking_id, type)
  where booking_id is not null
    and type in ('confirmed', 'assigned', 'reminder');

comment on index public.user_notifications_idempotency_user_booking_type_key is
  'Unique (user_id, booking_id, type) for confirmed/assigned/reminder — insert no-op on conflict.';

-- Extended in 20260483 (cancelled type + index replace + recent index).
