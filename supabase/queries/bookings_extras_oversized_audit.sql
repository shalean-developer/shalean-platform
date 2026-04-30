-- Audit: bookings whose extras JSON array is unusually long (often bad client data or legacy bugs).
-- `bookings.extras` is jsonb; use jsonb_array_length (not json_array_length).
-- Run in SQL editor; review rows before any repair.

select
  id,
  created_at,
  status,
  jsonb_array_length(extras) as extras_count
from public.bookings
where
  extras is not null
  and jsonb_typeof(extras) = 'array'
  and jsonb_array_length(extras) > 24
order by created_at desc
limit 500;
