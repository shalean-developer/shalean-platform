-- Completed solo bookings: line items vs earnings snapshot coverage (recent first).

select
  b.id,
  b.status,
  b.cleaner_id,
  (select count(*)::int from public.booking_line_items li where li.booking_id = b.id) as line_item_count,
  (s.booking_id is not null) as has_earnings_snapshot,
  s.display_earnings_cents as snapshot_display_cents,
  b.display_earnings_cents as booking_display_cents
from public.bookings b
left join public.booking_cleaner_earnings_snapshot s on s.booking_id = b.id
where b.status = 'completed'
  and coalesce(b.is_team_job, false) = false
order by b.created_at desc
limit 50;
