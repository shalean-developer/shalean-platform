-- Weekly audit: active-ish bookings missing structured scope (cleaner UX / reporting).
-- Tune status list for your ops model.

select
  id,
  created_at,
  status,
  rooms,
  bathrooms,
  extras,
  booking_snapshot is null as snapshot_missing
from public.bookings
where
  (rooms is null or bathrooms is null)
  and coalesce(status, '') not in ('cancelled', 'refunded')
order by created_at desc
limit 500;
