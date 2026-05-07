-- In-progress jobs missing persisted display / line earnings (often blocks completion payout verify).
-- Read-only; run in SQL editor.

select
  id,
  status,
  cleaner_response_status,
  display_earnings_cents,
  cleaner_earnings_total_cents,
  completed_at,
  updated_at
from public.bookings
where lower(trim(coalesce(status, ''))) = 'in_progress'
  and (
    display_earnings_cents is null
    or cleaner_earnings_total_cents is null
  )
order by updated_at desc nulls last
limit 500;
