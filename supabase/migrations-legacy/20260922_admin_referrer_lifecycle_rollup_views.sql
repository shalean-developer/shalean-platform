-- Lifecycle rollups for admin / growth intelligence (referral_events — reward + conversion).

-- ---------------------------------------------------------------------------
-- Reward settlement events (per referrer)
-- ---------------------------------------------------------------------------
create or replace view public.admin_referrer_reward_rollups as
select
  e.referrer_type,
  e.referrer_id,
  count(*)::bigint as rewards_credited_count,
  coalesce(sum(e.value_zar), 0)::bigint as total_rewards_zar,
  case
    when count(*) > 0 then round(avg(e.value_zar::numeric), 2)
    else null
  end as avg_reward_zar,
  max(e.created_at) as latest_reward_at,
  count(*) filter (where e.referrer_type = 'customer')::bigint as customer_reward_count,
  count(*) filter (where e.referrer_type = 'cleaner')::bigint as cleaner_reward_count
from public.referral_events e
where e.event_type = 'referral_reward_credited'
group by e.referrer_type, e.referrer_id;

comment on view public.admin_referrer_reward_rollups is
  'Per-referrer aggregates for referral_reward_credited events.';

-- ---------------------------------------------------------------------------
-- Conversion milestone events (per referrer)
-- ---------------------------------------------------------------------------
create or replace view public.admin_referrer_conversion_rollups as
select
  e.referrer_type,
  e.referrer_id,
  count(*)::bigint as conversions_completed,
  count(distinct e.referee_user_id) filter (where e.referee_user_id is not null)::bigint
    as distinct_referee_count,
  max(e.created_at) as latest_conversion_at,
  count(*) filter (where e.referrer_type = 'customer')::bigint as customer_conversion_count,
  count(*) filter (where e.referrer_type = 'cleaner')::bigint as cleaner_conversion_count
from public.referral_events e
where e.event_type = 'referral_conversion_completed'
group by e.referrer_type, e.referrer_id;

comment on view public.admin_referrer_conversion_rollups is
  'Per-referrer aggregates for referral_conversion_completed (distinct_referee_count = unique referee user ids).';
