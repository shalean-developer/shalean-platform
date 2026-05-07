-- Stabilize referral_events.event_type for rollups, admin, and future emitters.

alter table public.referral_events drop constraint if exists referral_events_event_type_check;

alter table public.referral_events
  add constraint referral_events_event_type_check
  check (
    event_type in (
      'checkout_discount_applied',
      'cleaner_checkout_attribution',
      'referral_conversion_completed',
      'referral_reward_credited'
    )
  );

comment on constraint referral_events_event_type_check on public.referral_events is
  'Allowed analytics event names; extend via migration when adding new emitters.';
