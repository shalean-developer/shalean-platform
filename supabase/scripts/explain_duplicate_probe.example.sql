-- One-time: confirm duplicate probe uses idx_bookings_active_dup (replace literals with real UUID/date/time/slug).
-- Checklist: Index Scan using idx_bookings_active_dup (or Bitmap); "Rows Removed by Filter" small/0;
-- planning time low; execution time < ~1 ms when cache-warm.
EXPLAIN ANALYZE
SELECT id
FROM public.bookings
WHERE user_id = '00000000-0000-0000-0000-000000000000'::uuid
  AND date = '2026-04-28'
  AND time = '09:00'
  AND service_slug = 'standard'
  AND status NOT IN ('cancelled', 'failed', 'payment_expired')
LIMIT 1;
