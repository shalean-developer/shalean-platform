-- Phase 4: Growth & expansion — referrals completion states, segments, outreach cooldown, user_events.

-- ---------------------------------------------------------------------------
-- Referrals: code snapshot, rewarded state, timestamps (cleaner flow keeps "completed")
-- ---------------------------------------------------------------------------
alter table public.referrals
  add column if not exists code text,
  add column if not exists rewarded_at timestamptz;

alter table public.referrals drop constraint if exists referrals_status_check;

alter table public.referrals
  add constraint referrals_status_check
  check (status in ('pending', 'completed', 'rewarded'));

drop index if exists referrals_completed_once_per_referred_type_idx;

create unique index if not exists referrals_finalized_once_per_referred_idx
  on public.referrals (referrer_type, referred_email_or_phone)
  where status in ('completed', 'rewarded');

-- Customer referrals already paid out: align status with new "rewarded" terminal state.
update public.referrals
set status = 'rewarded', rewarded_at = coalesce(rewarded_at, completed_at, created_at)
where referrer_type = 'customer' and status = 'completed';

-- ---------------------------------------------------------------------------
-- Customer primary city (denormalized from bookings for segmentation / city scope)
-- ---------------------------------------------------------------------------
alter table public.user_profiles
  add column if not exists primary_city_id uuid references public.cities(id) on delete set null;

create index if not exists user_profiles_primary_city_idx
  on public.user_profiles (primary_city_id)
  where primary_city_id is not null;

-- ---------------------------------------------------------------------------
-- Segmentation row (one per user; updated by app)
-- ---------------------------------------------------------------------------
create table if not exists public.customer_segment (
  user_id uuid primary key references auth.users (id) on delete cascade,
  segment text not null check (segment in ('new', 'repeat', 'loyal', 'churned')),
  city_id uuid references public.cities(id) on delete set null,
  updated_at timestamptz not null default now()
);

create index if not exists customer_segment_segment_idx
  on public.customer_segment (segment, updated_at desc);

create index if not exists customer_segment_city_idx
  on public.customer_segment (city_id)
  where city_id is not null;

alter table public.customer_segment enable row level security;

-- ---------------------------------------------------------------------------
-- Growth outreach touches (cooldown / anti-spam; not booking-scoped)
-- ---------------------------------------------------------------------------
create table if not exists public.growth_customer_touch (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  touch_type text not null check (touch_type in ('retention_reminder', 'win_back', 'ltv_discount', 'ltv_recurring', 'ltv_upsell')),
  channel text not null check (channel in ('whatsapp', 'email', 'sms')),
  created_at timestamptz not null default now()
);

create index if not exists growth_customer_touch_user_created_idx
  on public.growth_customer_touch (user_id, created_at desc);

create index if not exists growth_customer_touch_user_type_idx
  on public.growth_customer_touch (user_id, touch_type, created_at desc);

alter table public.growth_customer_touch enable row level security;

-- ---------------------------------------------------------------------------
-- user_events: referral + growth analytics
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
      'growth_retention_reminder',
      'growth_win_back',
      'growth_ltv_message'
    )
  );

comment on table public.customer_segment is
  'Marketing/pricing segment per customer (Phase 4 growth engine).';

comment on table public.growth_customer_touch is
  'Outbound growth touches for per-user cooldown (complements payment-link decision engine).';
