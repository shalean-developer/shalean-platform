-- Blog TOC navigation clicks for engagement / section-intent analysis.

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
      'price_updated',
      'review_submitted',
      'review_prompt_sent',
      'review_prompt_clicked',
      'payment_initiated',
      'payment_completed',
      'blog_scroll',
      'blog_cta_click',
      'blog_time_on_page',
      'blog_toc_click',
      'seo_location_scroll',
      'seo_cta_click',
      'seo_service_card_click',
      'seo_faq_expand',
      'seo_pricing_interaction'
    )
  );
