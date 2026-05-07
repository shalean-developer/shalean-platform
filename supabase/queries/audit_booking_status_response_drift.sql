-- Read-only: rows where cleaner response progressed but booking.status is still assignable.
-- Run after deploy; use to verify migration + runtime heals.

select
  id,
  status,
  cleaner_response_status,
  dispatch_status,
  accepted_at,
  en_route_at,
  started_at,
  updated_at
from public.bookings
where lower(trim(coalesce(status, ''))) = 'assigned'
  and lower(trim(coalesce(cleaner_response_status, ''))) in ('accepted', 'on_my_way', 'started')
order by updated_at desc nulls last
limit 500;
