-- Analytical spine for confirmed checkout referral redemptions (operational tables unchanged).

-- ---------------------------------------------------------------------------
-- referral_events: append-only attribution / funnel analytics
-- ---------------------------------------------------------------------------
create table if not exists public.referral_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  booking_id uuid references public.bookings (id) on delete cascade,
  referral_redemption_id uuid references public.referral_discount_redemptions (id) on delete set null,
  referrer_id uuid,
  referrer_type text check (referrer_type is null or referrer_type in ('customer', 'cleaner')),
  referee_user_id uuid references auth.users (id) on delete set null,
  value_zar integer,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.referral_events is
  'Projections of confirmed referral facts (e.g. post-redemption); not a replacement for referral_discount_redemptions.';

create index if not exists referral_events_booking_idx on public.referral_events (booking_id, created_at desc);
create index if not exists referral_events_type_created_idx on public.referral_events (event_type, created_at desc);
create index if not exists referral_events_referrer_idx on public.referral_events (referrer_type, referrer_id, created_at desc);

-- Idempotent emission on Paystack webhook retries (one row per event_type per booking).
create unique index if not exists referral_events_unique_event_booking_uidx
  on public.referral_events (event_type, booking_id)
  where booking_id is not null;

alter table public.referral_events enable row level security;

-- ---------------------------------------------------------------------------
-- user_events: allow dual-write for checkout referral milestones + idempotency
-- ---------------------------------------------------------------------------
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
      'checkout_discount_applied',
      'cleaner_checkout_attribution',
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
      'blog_toc_section_engagement',
      'seo_location_scroll',
      'seo_cta_click',
      'seo_service_card_click',
      'seo_faq_expand',
      'seo_pricing_interaction'
    )
  );

create unique index if not exists user_events_referral_checkout_booking_uidx
  on public.user_events (event_type, booking_id)
  where booking_id is not null
    and event_type in ('checkout_discount_applied', 'cleaner_checkout_attribution');
