-- Payout integrity daily signals (same counts + ratios as POST /api/cron/payout-integrity-daily).
-- Run in SQL editor or schedule via pg_cron / BI.
--
-- For `[metric]` JSON logs (Datadog / Vercel log drain), filter on:
--   name = 'payout.invalid_paid_rows_count' | 'payout.stuck_earnings_triggered' | 'payout.mark_paid_readback_failures'
--   | 'payout.stuck_earnings_recompute_skipped_cooldown'
-- and bucket by `ts` date. Skipped-recompute metrics use `reason` (`cooldown` | `missing_booking` | `deleted_booking`
-- | reserved `recent_success`) and, for cooldown, `next_allowed_at_utc` (ISO, UTC).

-- --- Counts ---
select count(*)::bigint as paid_missing_payout_paid_at
from public.bookings
where payout_status = 'paid'
  and payout_paid_at is null;

select count(*)::bigint as eligible_missing_payout_frozen_cents
from public.bookings
where payout_status = 'eligible'
  and payout_frozen_cents is null;

select count(*)::bigint as team_jobs_missing_payout_owner
from public.bookings
where is_team_job is true
  and payout_owner_cleaner_id is null;

-- --- Ratios (same semantics as cron: bad / total in cohort) ---
with s as (
  select
    count(*) filter (where payout_status = 'paid') as total_paid,
    count(*) filter (where payout_status = 'paid' and payout_paid_at is null) as bad_paid,
    count(*) filter (where payout_status = 'eligible') as total_eligible,
    count(*) filter (where payout_status = 'eligible' and payout_frozen_cents is null) as bad_eligible,
    count(*) filter (where is_team_job is true) as total_team,
    count(*) filter (where is_team_job is true and payout_owner_cleaner_id is null) as bad_team
  from public.bookings
)
select
  round(100.0 * bad_paid / nullif(total_paid, 0), 4) as invalid_paid_ratio_pct,
  round(100.0 * bad_eligible / nullif(total_eligible, 0), 4) as eligible_missing_frozen_ratio_pct,
  round(100.0 * bad_team / nullif(total_team, 0), 4) as team_missing_owner_ratio_pct
from s;

-- --- Last 24h trend + 6h rolling mean (hourly) ---
-- `bookings` has no `updated_at` in this schema; we bucket by `coalesce(completed_at, created_at)` UTC
-- (job completion time when set, else row creation). `ma_6h` = mean of current hour and up to 5 preceding buckets.
-- `cumulative_24h` = running sum over returned hourly buckets (builds within the window).

with hourly as (
  select
    date_trunc('hour', coalesce(b.completed_at, b.created_at) at time zone 'UTC') as hour_utc,
    count(*)::bigint as n
  from public.bookings b
  where b.payout_status = 'eligible'
    and b.payout_frozen_cents is null
    and coalesce(b.completed_at, b.created_at) >= now() - interval '24 hours'
  group by 1
)
select
  hour_utc,
  n,
  round(
    avg(n::numeric) over (order by hour_utc rows between 5 preceding and current row),
    2
  ) as ma_6h,
  sum(n) over (order by hour_utc rows between unbounded preceding and current row) as cumulative_24h
from hourly
order by 1;

with hourly as (
  select
    date_trunc('hour', coalesce(b.completed_at, b.created_at) at time zone 'UTC') as hour_utc,
    count(*)::bigint as n
  from public.bookings b
  where b.payout_status = 'paid'
    and b.payout_paid_at is null
    and coalesce(b.completed_at, b.created_at) >= now() - interval '24 hours'
  group by 1
)
select
  hour_utc,
  n,
  round(
    avg(n::numeric) over (order by hour_utc rows between 5 preceding and current row),
    2
  ) as ma_6h,
  sum(n) over (order by hour_utc rows between unbounded preceding and current row) as cumulative_24h
from hourly
order by 1;

with hourly as (
  select
    date_trunc('hour', coalesce(b.completed_at, b.created_at) at time zone 'UTC') as hour_utc,
    count(*)::bigint as n
  from public.bookings b
  where b.is_team_job is true
    and b.payout_owner_cleaner_id is null
    and coalesce(b.completed_at, b.created_at) >= now() - interval '24 hours'
  group by 1
)
select
  hour_utc,
  n,
  round(
    avg(n::numeric) over (order by hour_utc rows between 5 preceding and current row),
    2
  ) as ma_6h,
  sum(n) over (order by hour_utc rows between unbounded preceding and current row) as cumulative_24h
from hourly
order by 1;
