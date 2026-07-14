-- Allow growth/analytics event types emitted by /api/analytics/event (see apps/web/lib/growth/trackEvent.ts).

alter table public.user_events drop constraint if exists user_events_event_type_check;

alter table public.user_events
  add constraint user_events_event_type_check
  check (
    event_type in (
      'booking_created',
      'booking_completed',
      'slot_selected',
      'extra_added',
      'recommendation_clicked',
      'flow_step_viewed',
      'flow_drop_off',
      'booking_agent_quote',
      'booking_agent_confirm',
      'page_view',
      'start_booking',
      'view_price',
      'select_time',
      'complete_booking',
      'referral_created',
      'referral_completed',
      'referral_rewarded',
      'growth_retention_reminder',
      'growth_win_back',
      'growth_ltv_message',
      'cleaners_loaded',
      'times_loaded',
      'price_calculated',
      'booking_started',
      'booking_upsell_interaction',
      'homepage_continue_booking',
      'homepage_cta_click',
      'homepage_service_select',
      'pricing_loaded',
      'homepage_abandon',
      'homepage_scroll',
      'price_updated'
    )
  );
