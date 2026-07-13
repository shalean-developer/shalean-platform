-- Promotion & Campaign Management System
-- Configurable promotions, seasonal campaigns, bundles, memberships, birthday rewards.

-- ─── Birthday on profiles ─────────────────────────────────────────────────────
alter table public.user_profiles
  add column if not exists date_of_birth date;

comment on column public.user_profiles.date_of_birth is
  'Customer birthday (date only). Used for birthday cleaning credit automation.';

-- ─── Promotions ───────────────────────────────────────────────────────────────
create table if not exists public.promotions (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  promotion_type text not null
    check (promotion_type in (
      'first_booking',
      'referral',
      'membership',
      'bundle',
      'birthday',
      'seasonal',
      'promo_code',
      'custom'
    )),
  status text not null default 'draft'
    check (status in ('draft', 'scheduled', 'active', 'paused', 'expired', 'ended')),
  starts_at timestamptz,
  ends_at timestamptz,
  banner_image_url text,
  landing_page_path text,
  promo_code text,
  auto_apply boolean not null default false,
  -- Discount
  discount_type text not null default 'percent'
    check (discount_type in ('percent', 'fixed', 'credit')),
  discount_value numeric not null default 0 check (discount_value >= 0),
  max_discount_zar numeric check (max_discount_zar is null or max_discount_zar >= 0),
  min_booking_amount_zar numeric not null default 0 check (min_booking_amount_zar >= 0),
  -- Eligibility (JSON rules evaluated server-side)
  customer_eligibility jsonb not null default '{}'::jsonb,
  booking_eligibility jsonb not null default '{}'::jsonb,
  -- Limits
  usage_limit_total int check (usage_limit_total is null or usage_limit_total > 0),
  usage_limit_per_customer int check (usage_limit_per_customer is null or usage_limit_per_customer > 0),
  budget_zar numeric check (budget_zar is null or budget_zar >= 0),
  budget_spent_zar numeric not null default 0 check (budget_spent_zar >= 0),
  -- Stacking
  stackable boolean not null default false,
  stack_priority int not null default 100,
  -- Display
  show_on_homepage boolean not null default false,
  show_on_booking boolean not null default false,
  show_on_pricing boolean not null default false,
  show_announcement_bar boolean not null default false,
  display_config jsonb not null default '{}'::jsonb,
  -- Analytics counters (denormalized for speed)
  views_count bigint not null default 0,
  clicks_count bigint not null default 0,
  bookings_started_count bigint not null default 0,
  bookings_completed_count bigint not null default 0,
  revenue_generated_zar numeric not null default 0,
  redemptions_count bigint not null default 0,
  -- Meta
  created_by text,
  updated_by text,
  duplicated_from_id uuid references public.promotions (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists promotions_promo_code_uidx
  on public.promotions (upper(promo_code))
  where promo_code is not null and btrim(promo_code) <> '';

create index if not exists promotions_status_dates_idx
  on public.promotions (status, starts_at, ends_at);

create index if not exists promotions_type_status_idx
  on public.promotions (promotion_type, status);

-- ─── Redemptions (audit + idempotency) ────────────────────────────────────────
create table if not exists public.promotion_redemptions (
  id uuid primary key default gen_random_uuid(),
  promotion_id uuid not null references public.promotions (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  booking_id uuid references public.bookings (id) on delete set null,
  customer_email text,
  discount_zar numeric not null default 0 check (discount_zar >= 0),
  credit_issued_zar numeric not null default 0 check (credit_issued_zar >= 0),
  status text not null default 'applied'
    check (status in ('applied', 'reversed', 'pending')),
  idempotency_key text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists promotion_redemptions_idempotency_uidx
  on public.promotion_redemptions (idempotency_key)
  where idempotency_key is not null;

create index if not exists promotion_redemptions_promo_user_idx
  on public.promotion_redemptions (promotion_id, user_id, created_at desc);

create index if not exists promotion_redemptions_booking_idx
  on public.promotion_redemptions (booking_id)
  where booking_id is not null;

-- ─── Events (views, clicks, funnel) ───────────────────────────────────────────
create table if not exists public.promotion_events (
  id uuid primary key default gen_random_uuid(),
  promotion_id uuid not null references public.promotions (id) on delete cascade,
  event_type text not null
    check (event_type in (
      'view', 'click', 'booking_started', 'booking_completed',
      'code_applied', 'code_rejected', 'credit_issued', 'email_sent', 'sms_sent'
    )),
  user_id uuid references auth.users (id) on delete set null,
  booking_id uuid references public.bookings (id) on delete set null,
  session_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists promotion_events_promo_type_idx
  on public.promotion_events (promotion_id, event_type, created_at desc);

create index if not exists promotion_events_created_idx
  on public.promotion_events (created_at desc);

-- ─── Bundle rules ─────────────────────────────────────────────────────────────
create table if not exists public.promotion_bundles (
  id uuid primary key default gen_random_uuid(),
  promotion_id uuid not null references public.promotions (id) on delete cascade,
  name text not null,
  required_service_slugs text[] not null default '{}',
  required_extra_ids text[] not null default '{}',
  min_services int not null default 2 check (min_services >= 2),
  discount_type text not null default 'percent'
    check (discount_type in ('percent', 'fixed')),
  discount_value numeric not null check (discount_value >= 0),
  max_discount_zar numeric,
  stackable boolean not null default false,
  enabled boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists promotion_bundles_promo_idx
  on public.promotion_bundles (promotion_id, enabled);

-- ─── Membership plans ─────────────────────────────────────────────────────────
create table if not exists public.membership_plans (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  billing_frequency text not null
    check (billing_frequency in ('weekly', 'biweekly', 'monthly')),
  price_zar numeric not null check (price_zar >= 0),
  discount_percent numeric not null default 0
    check (discount_percent >= 0 and discount_percent <= 100),
  benefits jsonb not null default '[]'::jsonb,
  priority_booking boolean not null default true,
  preferred_cleaner boolean not null default true,
  birthday_bonus boolean not null default true,
  member_only_offers boolean not null default true,
  enabled boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.customer_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  plan_id uuid not null references public.membership_plans (id) on delete restrict,
  status text not null default 'active'
    check (status in ('active', 'paused', 'cancelled', 'expired', 'past_due')),
  started_at timestamptz not null default now(),
  current_period_start timestamptz not null default now(),
  current_period_end timestamptz,
  cancelled_at timestamptz,
  pause_reason text,
  savings_to_date_zar numeric not null default 0,
  preferred_cleaner_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists customer_memberships_active_user_uidx
  on public.customer_memberships (user_id)
  where status = 'active';

create index if not exists customer_memberships_plan_status_idx
  on public.customer_memberships (plan_id, status);

-- ─── Birthday reward ledger ───────────────────────────────────────────────────
create table if not exists public.birthday_rewards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  promotion_id uuid references public.promotions (id) on delete set null,
  reward_year int not null,
  credit_zar numeric not null check (credit_zar >= 0),
  expires_at timestamptz not null,
  status text not null default 'issued'
    check (status in ('issued', 'redeemed', 'expired', 'revoked')),
  credit_transaction_id uuid,
  redeemed_booking_id uuid references public.bookings (id) on delete set null,
  email_sent_at timestamptz,
  sms_sent_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists birthday_rewards_user_year_uidx
  on public.birthday_rewards (user_id, reward_year);

create index if not exists birthday_rewards_status_expires_idx
  on public.birthday_rewards (status, expires_at);

-- ─── Marketing automation rules ───────────────────────────────────────────────
create table if not exists public.marketing_automation_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  trigger_event text not null
    check (trigger_event in (
      'registration',
      'first_booking',
      'completed_booking',
      'cancelled_booking',
      'birthday',
      'referral_completed',
      'membership_renewal',
      'inactive_30',
      'inactive_60',
      'inactive_90',
      'seasonal_campaign_start'
    )),
  enabled boolean not null default false,
  channel text not null default 'email'
    check (channel in ('email', 'sms', 'push', 'email_sms')),
  delay_minutes int not null default 0 check (delay_minutes >= 0),
  subject_template text,
  body_html_template text,
  sms_template text,
  promotion_id uuid references public.promotions (id) on delete set null,
  audience_filter jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists marketing_automation_rules_trigger_idx
  on public.marketing_automation_rules (trigger_event, enabled);

-- ─── Audit log ────────────────────────────────────────────────────────────────
create table if not exists public.promotion_audit_log (
  id uuid primary key default gen_random_uuid(),
  promotion_id uuid references public.promotions (id) on delete set null,
  action text not null,
  actor text,
  before_state jsonb,
  after_state jsonb,
  created_at timestamptz not null default now()
);

create index if not exists promotion_audit_log_promo_idx
  on public.promotion_audit_log (promotion_id, created_at desc);

-- ─── RLS (admin via service role; customers read active display) ──────────────
alter table public.promotions enable row level security;
alter table public.promotion_redemptions enable row level security;
alter table public.promotion_events enable row level security;
alter table public.promotion_bundles enable row level security;
alter table public.membership_plans enable row level security;
alter table public.customer_memberships enable row level security;
alter table public.birthday_rewards enable row level security;
alter table public.marketing_automation_rules enable row level security;
alter table public.promotion_audit_log enable row level security;

-- Public can read active promotions for display surfaces
drop policy if exists promotions_public_read_active on public.promotions;
create policy promotions_public_read_active on public.promotions
  for select
  using (status = 'active');

drop policy if exists membership_plans_public_read on public.membership_plans;
create policy membership_plans_public_read on public.membership_plans
  for select
  using (enabled = true);

drop policy if exists customer_memberships_own_read on public.customer_memberships;
create policy customer_memberships_own_read on public.customer_memberships
  for select
  using (auth.uid() = user_id);

drop policy if exists birthday_rewards_own_read on public.birthday_rewards;
create policy birthday_rewards_own_read on public.birthday_rewards
  for select
  using (auth.uid() = user_id);

drop policy if exists promotion_bundles_public_read on public.promotion_bundles;
create policy promotion_bundles_public_read on public.promotion_bundles
  for select
  using (
    enabled = true
    and exists (
      select 1 from public.promotions p
      where p.id = promotion_id and p.status = 'active'
    )
  );

-- ─── Status sync helper ───────────────────────────────────────────────────────
create or replace function public.sync_promotion_statuses()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_count integer := 0;
begin
  update public.promotions
  set status = 'active', updated_at = now()
  where status = 'scheduled'
    and starts_at is not null
    and starts_at <= now()
    and (ends_at is null or ends_at > now());
  get diagnostics updated_count = row_count;

  update public.promotions
  set status = 'expired', updated_at = now()
  where status in ('active', 'scheduled', 'paused')
    and ends_at is not null
    and ends_at <= now();

  return updated_count;
end;
$$;

-- ─── Seed default promotions ──────────────────────────────────────────────────
insert into public.promotions (
  id, slug, name, description, promotion_type, status,
  starts_at, ends_at, auto_apply, discount_type, discount_value, max_discount_zar,
  min_booking_amount_zar, customer_eligibility, booking_eligibility,
  usage_limit_per_customer, stackable, stack_priority,
  show_on_homepage, show_on_booking, show_on_pricing, show_announcement_bar,
  display_config, promo_code
)
values
(
  'b1000000-0000-4000-8000-000000000001',
  'first-booking-15',
  'First Booking Discount',
  '15% off your first cleaning with Shalean. Automatically applied at checkout.',
  'first_booking',
  'active',
  now(),
  null,
  true,
  'percent',
  15,
  null,
  0,
  '{"requires_no_completed_bookings": true}'::jsonb,
  '{}'::jsonb,
  1,
  false,
  10,
  true,
  true,
  true,
  true,
  '{"headline": "15% off your first clean", "cta": "Book now"}'::jsonb,
  null
),
(
  'b1000000-0000-4000-8000-000000000002',
  'referral-rewards',
  'Referral Rewards',
  'Earn R200 Cleaning Credit when a friend completes their first booking. They get R200 too.',
  'referral',
  'active',
  now(),
  null,
  false,
  'credit',
  200,
  null,
  0,
  '{}'::jsonb,
  '{}'::jsonb,
  null,
  true,
  50,
  true,
  false,
  false,
  false,
  '{"headline": "Give R200, Get R200", "cta": "Refer a friend", "landing": "/refer"}'::jsonb,
  null
),
(
  'b1000000-0000-4000-8000-000000000003',
  'birthday-credit',
  'Birthday Cleaning Credit',
  'R200 Cleaning Credit on your birthday — valid for 30 days.',
  'birthday',
  'active',
  now(),
  null,
  true,
  'credit',
  200,
  null,
  0,
  '{"one_per_year": true}'::jsonb,
  '{}'::jsonb,
  1,
  true,
  40,
  false,
  false,
  false,
  false,
  '{"headline": "Happy Birthday!", "validity_days": 30, "cta": "Redeem now"}'::jsonb,
  null
),
(
  'b1000000-0000-4000-8000-000000000004',
  'bundle-discounts',
  'Service Bundle Discounts',
  'Save when you combine complementary cleaning services.',
  'bundle',
  'active',
  now(),
  null,
  true,
  'percent',
  10,
  null,
  0,
  '{}'::jsonb,
  '{}'::jsonb,
  null,
  false,
  20,
  false,
  true,
  true,
  false,
  '{"headline": "Bundle & save", "cta": "See bundles"}'::jsonb,
  null
),
(
  'b1000000-0000-4000-8000-000000000005',
  'spring-cleaning-2026',
  'Spring Cleaning Special',
  'Seasonal spring cleaning campaign — refresh your home this season.',
  'seasonal',
  'draft',
  '2026-09-01T00:00:00+02:00'::timestamptz,
  '2026-09-30T23:59:59+02:00'::timestamptz,
  true,
  'percent',
  10,
  150,
  500,
  '{}'::jsonb,
  '{}'::jsonb,
  1,
  false,
  30,
  true,
  true,
  true,
  true,
  '{"headline": "Spring Cleaning Special", "colours": {"primary": "#2D6A4F", "accent": "#95D5B2"}, "countdown": true, "cta": "Book spring clean"}'::jsonb,
  'SPRING10'
)
on conflict (id) do nothing;

-- Sync referral promo reward with program settings default (display only; real logic in referrals module)
update public.promotions
set discount_value = coalesce(
  (select reward_amount_zar from public.referral_program_settings where id = 'default'),
  200
)
where id = 'b1000000-0000-4000-8000-000000000002';

-- Seed example bundles
insert into public.promotion_bundles (
  id, promotion_id, name, required_service_slugs, required_extra_ids,
  min_services, discount_type, discount_value, stackable, enabled, sort_order
)
values
(
  'b2000000-0000-4000-8000-000000000001',
  'b1000000-0000-4000-8000-000000000004',
  'Deep Clean + Oven',
  array['deep-cleaning'],
  array['oven-cleaning'],
  2,
  'percent',
  10,
  false,
  true,
  1
),
(
  'b2000000-0000-4000-8000-000000000002',
  'b1000000-0000-4000-8000-000000000004',
  'Move Out + Carpet',
  array['move-out-cleaning'],
  array['carpet-cleaning'],
  2,
  'percent',
  12,
  false,
  true,
  2
),
(
  'b2000000-0000-4000-8000-000000000003',
  'b1000000-0000-4000-8000-000000000004',
  'Airbnb + Laundry',
  array['airbnb-cleaning'],
  array['laundry'],
  2,
  'fixed',
  100,
  false,
  true,
  3
),
(
  'b2000000-0000-4000-8000-000000000004',
  'b1000000-0000-4000-8000-000000000004',
  'Windows + Deep Clean',
  array['deep-cleaning', 'window-cleaning'],
  array[]::text[],
  2,
  'percent',
  15,
  false,
  true,
  4
)
on conflict (id) do nothing;

-- Seed membership plans
insert into public.membership_plans (
  id, slug, name, description, billing_frequency, price_zar, discount_percent,
  benefits, priority_booking, preferred_cleaner, birthday_bonus, member_only_offers,
  enabled, sort_order
)
values
(
  'b3000000-0000-4000-8000-000000000001',
  'weekly-member',
  'Weekly Membership',
  'Weekly cleans with up to 15% savings, priority booking, and member perks.',
  'weekly',
  0,
  15,
  '["15% off every booking", "Priority booking", "Preferred cleaner", "Member-only offers", "Birthday reward"]'::jsonb,
  true, true, true, true, true, 1
),
(
  'b3000000-0000-4000-8000-000000000002',
  'biweekly-member',
  'Bi-weekly Membership',
  'Fortnightly cleans with 10% savings and member benefits.',
  'biweekly',
  0,
  10,
  '["10% off every booking", "Priority booking", "Preferred cleaner", "Member-only offers", "Birthday reward"]'::jsonb,
  true, true, true, true, true, 2
),
(
  'b3000000-0000-4000-8000-000000000003',
  'monthly-member',
  'Monthly Membership',
  'Monthly cleans with 5% savings and exclusive member offers.',
  'monthly',
  0,
  5,
  '["5% off every booking", "Priority booking", "Member-only offers", "Birthday reward"]'::jsonb,
  true, false, true, true, true, 3
)
on conflict (id) do nothing;

-- Seed marketing automation rules (disabled by default)
insert into public.marketing_automation_rules (
  id, name, trigger_event, enabled, channel, delay_minutes,
  subject_template, body_html_template, promotion_id
)
values
(
  'b4000000-0000-4000-8000-000000000001',
  'Welcome — First Booking Offer',
  'registration',
  false,
  'email',
  30,
  'Welcome to Shalean — 15% off your first clean',
  '<p>Hi {{name}},</p><p>Enjoy <strong>15% off</strong> your first booking with Shalean.</p><p><a href="{{booking_url}}">Book now</a></p>',
  'b1000000-0000-4000-8000-000000000001'
),
(
  'b4000000-0000-4000-8000-000000000002',
  'Birthday Reward',
  'birthday',
  true,
  'email',
  0,
  'Happy Birthday from Shalean! Here''s R{{credit}} Cleaning Credit',
  '<p>Happy Birthday {{name}}!</p><p>We''ve added <strong>R{{credit}}</strong> Cleaning Credit to your account. Valid for 30 days.</p><p><a href="{{rewards_url}}">View rewards</a></p>',
  'b1000000-0000-4000-8000-000000000003'
),
(
  'b4000000-0000-4000-8000-000000000003',
  'Win-back 30 days inactive',
  'inactive_30',
  false,
  'email',
  0,
  'We miss you — come back to a sparkling home',
  '<p>Hi {{name}},</p><p>It''s been a while. Book again and enjoy a special welcome-back rate.</p>',
  null
)
on conflict (id) do nothing;

comment on table public.promotions is
  'Admin-configurable promotions and seasonal campaigns. Evaluated server-side at checkout.';
comment on table public.promotion_redemptions is
  'Immutable-ish redemption ledger for promotions; supports reverse and idempotency.';
comment on table public.membership_plans is
  'Recurring membership SKUs with discount and perk configuration.';
comment on table public.birthday_rewards is
  'One birthday cleaning credit per customer per calendar year.';
