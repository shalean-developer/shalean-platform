-- Read-model rollups for admin referral enrichment (no workflow changes).

create or replace view public.admin_referrer_redemption_rollups as
select
  r.referrer_type,
  r.referrer_id,
  count(*)::bigint as redemption_count,
  coalesce(sum(r.discount_zar), 0)::bigint as total_discount_zar,
  max(r.created_at) as latest_redemption_at
from public.referral_discount_redemptions r
group by r.referrer_type, r.referrer_id;

comment on view public.admin_referrer_redemption_rollups is
  'Per-referrer aggregates from checkout discount redemptions (admin / analytics).';

create or replace view public.admin_referrer_event_rollups as
select
  e.referrer_type,
  e.referrer_id,
  count(*) filter (where e.event_type = 'checkout_discount_applied')::bigint as checkout_discount_event_count,
  count(distinct e.booking_id) filter (
    where e.event_type = 'checkout_discount_applied' and e.booking_id is not null
  )::bigint as attributed_bookings,
  count(*) filter (where e.event_type = 'cleaner_checkout_attribution')::bigint as cleaner_checkout_attribution_count
from public.referral_events e
group by e.referrer_type, e.referrer_id;

comment on view public.admin_referrer_event_rollups is
  'Per-referrer aggregates from referral_events (checkout + cleaner attribution counts).';
