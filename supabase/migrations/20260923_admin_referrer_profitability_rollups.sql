-- Attribution-based referral economics: revenue from bookings tied to checkout_discount_applied,
-- minus redemption discounts and lifecycle reward payouts (estimated net contribution — not full P&L).

create or replace view public.admin_referrer_profitability_rollups as
with attributed as (
  select
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
    )::bigint as gross_referred_revenue_zar,
    max(coalesce(b.payment_completed_at, b.created_at)) as latest_profitable_booking_at
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
  group by e.referrer_type, e.referrer_id
),
discounts as (
  select
    r.referrer_type,
    r.referrer_id,
    coalesce(r.total_discount_zar, 0)::bigint as total_discount_cost_zar
  from public.admin_referrer_redemption_rollups r
),
rewards as (
  select
    w.referrer_type,
    w.referrer_id,
    coalesce(w.total_rewards_zar, 0)::bigint as total_reward_cost_zar
  from public.admin_referrer_reward_rollups w
),
keys as (
  select referrer_type, referrer_id from attributed
  union
  select referrer_type, referrer_id from discounts
  union
  select referrer_type, referrer_id from rewards
)
select
  k.referrer_type,
  k.referrer_id,
  coalesce(a.gross_referred_revenue_zar, 0)::bigint as gross_referred_revenue_zar,
  coalesce(d.total_discount_cost_zar, 0)::bigint as total_discount_cost_zar,
  coalesce(r.total_reward_cost_zar, 0)::bigint as total_reward_cost_zar,
  (
    coalesce(a.gross_referred_revenue_zar, 0)
    - coalesce(d.total_discount_cost_zar, 0)
    - coalesce(r.total_reward_cost_zar, 0)
  )::bigint as estimated_net_contribution_zar,
  coalesce(a.profitable_booking_count, 0)::bigint as profitable_booking_count,
  case
    when coalesce(a.profitable_booking_count, 0) > 0 then
      round(coalesce(a.gross_referred_revenue_zar, 0)::numeric / a.profitable_booking_count::numeric, 2)
    else null
  end as avg_booking_value_zar,
  a.latest_profitable_booking_at
from keys k
left join attributed a on a.referrer_type = k.referrer_type and a.referrer_id = k.referrer_id
left join discounts d on d.referrer_type = k.referrer_type and d.referrer_id = k.referrer_id
left join rewards r on r.referrer_type = k.referrer_type and r.referrer_id = k.referrer_id;

comment on view public.admin_referrer_profitability_rollups is
  'Per-referrer economics: gross revenue from paid bookings with checkout_discount_applied, minus redemption discounts and referral_reward_credited totals; estimated_net_contribution_zar is not full profit.';
