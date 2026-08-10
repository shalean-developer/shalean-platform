-- P9 Booking Duration production verification.
-- New/active rows should have canonical duration coverage near 100%, and the
-- mismatch count should be zero after the synchronization trigger is deployed.

select
  count(*) as booking_count,
  count(*) filter (where duration_minutes >= 30) as covered_count,
  count(*) filter (where duration_minutes is null or duration_minutes < 30) as missing_count,
  round(
    100.0 * count(*) filter (where duration_minutes >= 30) / nullif(count(*), 0),
    2
  ) as coverage_pct,
  count(*) filter (
    where duration_minutes >= 30
      and (
        estimated_duration_minutes is distinct from duration_minutes
        or duration_hours is distinct from round((duration_minutes::numeric / 60), 2)
      )
  ) as mirror_mismatch_count
from public.bookings
where created_at >= now() - interval '30 days'
  and status not in ('cancelled', 'failed');
