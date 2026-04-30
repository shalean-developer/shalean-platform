-- Recent bookings vs line-item row counts (run in SQL editor after migration + backfill).

select
  b.id,
  b.created_at,
  b.status,
  count(li.id) as line_item_count
from public.bookings b
left join public.booking_line_items li on li.booking_id = b.id
group by b.id, b.created_at, b.status
order by b.created_at desc
limit 50;
