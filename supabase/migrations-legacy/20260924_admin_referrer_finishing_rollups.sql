-- Phase 1 finishing: monthly economics, quality signals, redemption spike hints (analytics only).

-- ---------------------------------------------------------------------------
-- Per-referrer, per-calendar-month economics (same semantics as admin_referrer_profitability_rollups)
-- ---------------------------------------------------------------------------
create or replace view public.admin_referrer_monthly_profitability_rollups as
with rev as (
  select
    date_trunc('month', coalesce(b.payment_completed_at, b.created_at)) as month_bucket,
    e.referrer_type,
    e.referrer_id,
    count(distinct e.booking_id)::bigint as profitable_booking_count,
    coalesce(
      sum(
        greatest(
          0,
          case
            when b.total_paid_zar is not null then b.total_paid_zar::bigint
            else round(coalesce(b.amount_paid_cents, 0)::numeric / 100)::bigint
          end
        )
      ),
      0
    )::bigint as gross_referred_revenue_zar
  from public.referral_events e
  inner join public.bookings b on b.id = e.booking_id
  where e.event_type = 'checkout_discount_applied'
    and e.booking_id is not null
    and coalesce(lower(trim(b.status)), '') not in (
      'pending_payment',
      'payment_expired',
      'cancelled',
      'failed'
    )
  group by 1, 2, 3
),
disc as (
  select
    date_trunc('month', r.created_at) as month_bucket,
    r.referrer_type,
    r.referrer_id,
    coalesce(sum(r.discount_zar), 0)::bigint as total_discount_cost_zar
  from public.referral_discount_redemptions r
  group by 1, 2, 3
),
rew as (
  select
    date_trunc('month', e.created_at) as month_bucket,
    e.referrer_type,
    e.referrer_id,
    coalesce(sum(e.value_zar), 0)::bigint as total_reward_cost_zar
  from public.referral_events e
  where e.event_type = 'referral_reward_credited'
  group by 1, 2, 3
),
keys as (
  select month_bucket, referrer_type, referrer_id from rev
  union
  select month_bucket, referrer_type, referrer_id from disc
  union
  select month_bucket, referrer_type, referrer_id from rew
)
select
  k.month_bucket,
  k.referrer_type,
  k.referrer_id,
  coalesce(v.gross_referred_revenue_zar, 0)::bigint as gross_referred_revenue_zar,
  coalesce(d.total_discount_cost_zar, 0)::bigint as total_discount_cost_zar,
  coalesce(w.total_reward_cost_zar, 0)::bigint as total_reward_cost_zar,
  (
    coalesce(v.gross_referred_revenue_zar, 0)
    - coalesce(d.total_discount_cost_zar, 0)
    - coalesce(w.total_reward_cost_zar, 0)
  )::bigint as estimated_net_contribution_zar,
  coalesce(v.profitable_booking_count, 0)::bigint as profitable_booking_count,
  case
    when coalesce(v.profitable_booking_count, 0) > 0 then
      round(coalesce(v.gross_referred_revenue_zar, 0)::numeric / v.profitable_booking_count::numeric, 2)
    else null
  end as avg_booking_value_zar
from keys k
left join rev v
  on v.month_bucket = k.month_bucket
 and v.referrer_type = k.referrer_type
 and v.referrer_id = k.referrer_id
left join disc d
  on d.month_bucket = k.month_bucket
 and d.referrer_type = k.referrer_type
 and d.referrer_id = k.referrer_id
left join rew w
  on w.month_bucket = k.month_bucket
 and w.referrer_type = k.referrer_type
 and w.referrer_id = k.referrer_id;

comment on view public.admin_referrer_monthly_profitability_rollups is
  'Monthly slice of attribution-based referral economics per referrer (UTC month from row timestamps).';

-- ---------------------------------------------------------------------------
-- Global monthly trend (all referrers summed)
-- ---------------------------------------------------------------------------
create or replace view public.admin_global_monthly_referral_economics as
select
  m.month_bucket,
  coalesce(sum(m.gross_referred_revenue_zar), 0)::bigint as gross_referred_revenue_zar,
  coalesce(sum(m.total_discount_cost_zar), 0)::bigint as total_discount_cost_zar,
  coalesce(sum(m.total_reward_cost_zar), 0)::bigint as total_reward_cost_zar,
  coalesce(sum(m.estimated_net_contribution_zar), 0)::bigint as estimated_net_contribution_zar,
  coalesce(sum(m.profitable_booking_count), 0)::bigint as profitable_booking_count
from public.admin_referrer_monthly_profitability_rollups m
group by m.month_bucket;

comment on view public.admin_global_monthly_referral_economics is
  'Platform-wide monthly referral economics rollup for trend dashboards.';

-- ---------------------------------------------------------------------------
-- Quality / abuse hints (read-only; combine lifecycle + profitability)
-- ---------------------------------------------------------------------------
create or replace view public.admin_referrer_quality_signals as
select
  c.referrer_type,
  c.referrer_id,
  case
    when coalesce(c.conversions_completed, 0) > 0 then
      round(
        (c.conversions_completed - coalesce(c.distinct_referee_count, 0))::numeric
          / c.conversions_completed::numeric,
        4
      )
    else null
  end as repeat_referee_excess_ratio,
  case
    when coalesce(p.gross_referred_revenue_zar, 0) > 0 then
      round(p.total_reward_cost_zar::numeric / p.gross_referred_revenue_zar::numeric, 4)
    else null
  end as reward_to_gross_revenue_ratio,
  c.conversions_completed,
  c.distinct_referee_count,
  coalesce(e.attributed_bookings, 0)::bigint as attributed_bookings,
  case
    when coalesce(e.attributed_bookings, 0) > 0 then
      round(c.conversions_completed::numeric / e.attributed_bookings::numeric, 4)
    else null
  end as conversion_to_attributed_booking_ratio,
  p.gross_referred_revenue_zar,
  p.total_reward_cost_zar,
  p.estimated_net_contribution_zar
from public.admin_referrer_conversion_rollups c
left join public.admin_referrer_profitability_rollups p
  on p.referrer_type = c.referrer_type and p.referrer_id = c.referrer_id
left join public.admin_referrer_event_rollups e
  on e.referrer_type = c.referrer_type and e.referrer_id = c.referrer_id;

comment on view public.admin_referrer_quality_signals is
  'Analytical ratios for referral quality review; does not modify operational data.';

-- ---------------------------------------------------------------------------
-- Redemption spike hint: current calendar month vs trailing 3 completed months avg
-- ---------------------------------------------------------------------------
create or replace view public.admin_referrer_redemption_spike_flags as
with monthly as (
  select
    r.referrer_type,
    r.referrer_id,
    date_trunc('month', r.created_at) as month_bucket,
    count(*)::bigint as redemption_count
  from public.referral_discount_redemptions r
  group by r.referrer_type, r.referrer_id, date_trunc('month', r.created_at)
),
anchor as (
  select date_trunc('month', current_timestamp) as this_month_start
),
with_avg as (
  select
    m.referrer_type,
    m.referrer_id,
    max(m.redemption_count) filter (where m.month_bucket = (select this_month_start from anchor)) as current_month_redemptions,
    avg(m.redemption_count) filter (
      where m.month_bucket < (select this_month_start from anchor)
        and m.month_bucket >= (select this_month_start from anchor) - interval '3 months'
    ) as avg_prior_3_months_redemptions
  from monthly m
  group by m.referrer_type, m.referrer_id
)
select
  w.referrer_type,
  w.referrer_id,
  coalesce(w.current_month_redemptions, 0)::bigint as current_month_redemptions,
  round(coalesce(w.avg_prior_3_months_redemptions, 0)::numeric, 2) as avg_prior_3_months_redemptions,
  (
    coalesce(w.current_month_redemptions, 0) >= 5
    and coalesce(w.current_month_redemptions, 0)
      >= 3 * greatest(coalesce(w.avg_prior_3_months_redemptions, 0), 1)
  ) as spike_suspected
from with_avg w
where coalesce(w.current_month_redemptions, 0) > 0;

comment on view public.admin_referrer_redemption_spike_flags is
  'Heuristic flag when current-month redemptions are high vs trailing 3-month average; review only.';
