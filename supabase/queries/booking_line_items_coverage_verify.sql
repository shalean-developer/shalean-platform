-- Canonical booking-line-item coverage and total integrity.
-- Run after deploy/backfill; the first result should return zero rows for new
-- production booking sources. Historical gaps are listed separately below.

with coverage as (
select
  b.id,
  b.created_at,
  b.status,
  b.booking_source,
  b.is_recurring_generated,
  round(coalesce(b.total_paid_zar, 0) * 100)::bigint as booking_total_cents,
  count(li.id) as line_item_count,
  coalesce(sum(li.total_price_cents), 0)::bigint as line_item_total_cents
from public.bookings b
left join public.booking_line_items li on li.booking_id = b.id
where b.created_at >= now() - interval '30 days'
group by b.id, b.created_at, b.status, b.booking_source, b.is_recurring_generated, b.total_paid_zar
)
select *
from coverage
where line_item_count = 0
   or (booking_total_cents > 0 and line_item_total_cents <> booking_total_cents)
order by created_at desc;

select
  count(*) filter (where li.booking_id is null) as historical_bookings_missing_lines,
  min(b.created_at) filter (where li.booking_id is null) as oldest_gap,
  max(b.created_at) filter (where li.booking_id is null) as newest_gap
from public.bookings b
left join (select distinct booking_id from public.booking_line_items) li on li.booking_id = b.id;
