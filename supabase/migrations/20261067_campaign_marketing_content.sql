-- Campaign Marketing Content System
-- Extends promotions with multi-channel content, assets, templates, and display surfaces.

-- ─── Extra display / creative columns on promotions ───────────────────────────
alter table public.promotions
  add column if not exists hero_image_url text,
  add column if not exists logo_url text,
  add column if not exists cta_label text,
  add column if not exists terms_html text,
  add column if not exists show_popup boolean not null default false,
  add column if not exists show_featured_card boolean not null default false,
  add column if not exists show_dashboard_card boolean not null default false,
  add column if not exists show_booking_banner boolean not null default false,
  add column if not exists qr_code_data_url text,
  add column if not exists content_generated_at timestamptz,
  add column if not exists template_key text;

comment on column public.promotions.hero_image_url is 'Campaign landing / hero creative URL';
comment on column public.promotions.qr_code_data_url is 'Cached QR code (data URL) pointing at campaign landing page';
comment on column public.promotions.template_key is 'Optional reusable campaign template key used at creation';

-- ─── Channel content (AI / template generated copy) ───────────────────────────
create table if not exists public.campaign_content (
  id uuid primary key default gen_random_uuid(),
  promotion_id uuid not null references public.promotions (id) on delete cascade,
  channel text not null
    check (channel in (
      'facebook',
      'instagram',
      'linkedin',
      'twitter',
      'whatsapp',
      'google_business',
      'email',
      'sms',
      'blog',
      'landing',
      'faq',
      'meta_seo',
      'pinterest'
    )),
  title text,
  body text not null default '',
  hashtags text[] not null default '{}',
  cta text,
  html_body text,
  meta jsonb not null default '{}'::jsonb,
  status text not null default 'draft'
    check (status in ('draft', 'ready', 'published', 'archived')),
  generated_by text not null default 'template'
    check (generated_by in ('template', 'ai', 'manual')),
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (promotion_id, channel)
);

create index if not exists campaign_content_promo_idx
  on public.campaign_content (promotion_id, channel);

-- ─── Creative assets / social image templates ─────────────────────────────────
create table if not exists public.campaign_assets (
  id uuid primary key default gen_random_uuid(),
  promotion_id uuid not null references public.promotions (id) on delete cascade,
  asset_type text not null
    check (asset_type in (
      'facebook_feed',
      'instagram_feed',
      'instagram_story',
      'facebook_story',
      'whatsapp_status',
      'linkedin_banner',
      'twitter_image',
      'pinterest_pin',
      'google_business_cover',
      'qr_code',
      'hero',
      'banner',
      'logo',
      'other'
    )),
  label text not null,
  width int,
  height int,
  image_url text,
  template_payload jsonb not null default '{}'::jsonb,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists campaign_assets_promo_idx
  on public.campaign_assets (promotion_id, asset_type);

-- ─── Reusable campaign templates ──────────────────────────────────────────────
create table if not exists public.campaign_templates (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  description text,
  category text not null default 'seasonal'
    check (category in (
      'first_booking',
      'referral',
      'seasonal',
      'birthday',
      'membership',
      'black_friday',
      'christmas',
      'womens_month',
      'spring_cleaning',
      'move_out',
      'airbnb',
      'custom'
    )),
  promotion_type text not null default 'seasonal',
  default_discount_type text not null default 'percent',
  default_discount_value numeric not null default 10,
  default_promo_code_prefix text,
  default_display_config jsonb not null default '{}'::jsonb,
  default_eligibility jsonb not null default '{}'::jsonb,
  default_copy_hints jsonb not null default '{}'::jsonb,
  enabled boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ─── Extend promotion_events for landing / QR / funnel ────────────────────────
alter table public.promotion_events drop constraint if exists promotion_events_event_type_check;
alter table public.promotion_events
  add constraint promotion_events_event_type_check
  check (event_type in (
    'view', 'click', 'booking_started', 'booking_completed',
    'code_applied', 'code_rejected', 'credit_issued', 'email_sent', 'sms_sent',
    'landing_visit', 'qr_scan', 'popup_view', 'popup_dismiss', 'content_generated'
  ));

-- ─── RLS ──────────────────────────────────────────────────────────────────────
alter table public.campaign_content enable row level security;
alter table public.campaign_assets enable row level security;
alter table public.campaign_templates enable row level security;

drop policy if exists campaign_content_public_read on public.campaign_content;
create policy campaign_content_public_read on public.campaign_content
  for select
  using (
    exists (
      select 1 from public.promotions p
      where p.id = promotion_id and p.status = 'active'
    )
  );

drop policy if exists campaign_assets_public_read on public.campaign_assets;
create policy campaign_assets_public_read on public.campaign_assets
  for select
  using (
    exists (
      select 1 from public.promotions p
      where p.id = promotion_id and p.status = 'active'
    )
  );

drop policy if exists campaign_templates_public_read on public.campaign_templates;
create policy campaign_templates_public_read on public.campaign_templates
  for select
  using (enabled = true);

-- ─── Seed templates ───────────────────────────────────────────────────────────
insert into public.campaign_templates (
  key, name, description, category, promotion_type,
  default_discount_type, default_discount_value, default_promo_code_prefix,
  default_display_config, default_eligibility, default_copy_hints, sort_order
)
values
(
  'first_booking',
  'First Booking Discount',
  'Welcome offer for first-time customers.',
  'first_booking',
  'first_booking',
  'percent',
  15,
  'FIRST',
  '{"headline": "15% off your first clean", "cta": "Book now", "countdown": true}'::jsonb,
  '{"requires_no_completed_bookings": true}'::jsonb,
  '{"tone": "welcoming", "focus": "trust and first-time savings"}'::jsonb,
  10
),
(
  'referral',
  'Referral Campaign',
  'Give / get cleaning credit when friends book.',
  'referral',
  'referral',
  'credit',
  200,
  null,
  '{"headline": "Give R200, Get R200", "cta": "Refer a friend", "landing": "/refer"}'::jsonb,
  '{}'::jsonb,
  '{"tone": "friendly", "focus": "mutual reward"}'::jsonb,
  20
),
(
  'seasonal',
  'Seasonal Promotion',
  'Generic seasonal campaign template.',
  'seasonal',
  'seasonal',
  'percent',
  10,
  'SEASON',
  '{"headline": "Seasonal savings", "cta": "Claim offer", "countdown": true}'::jsonb,
  '{}'::jsonb,
  '{"tone": "upbeat", "focus": "limited-time offer"}'::jsonb,
  30
),
(
  'birthday',
  'Birthday Rewards',
  'Birthday cleaning credit for customers.',
  'birthday',
  'birthday',
  'credit',
  200,
  null,
  '{"headline": "Happy Birthday!", "cta": "Redeem now", "validity_days": 30}'::jsonb,
  '{"one_per_year": true}'::jsonb,
  '{"tone": "celebratory", "focus": "personal reward"}'::jsonb,
  40
),
(
  'membership',
  'Membership Offer',
  'Promote recurring membership discounts.',
  'membership',
  'membership',
  'percent',
  15,
  'MEMBER',
  '{"headline": "Members save more", "cta": "Join now"}'::jsonb,
  '{"requires_membership": false}'::jsonb,
  '{"tone": "professional", "focus": "ongoing value"}'::jsonb,
  50
),
(
  'black_friday',
  'Black Friday',
  'High-urgency Black Friday cleaning deals.',
  'black_friday',
  'seasonal',
  'percent',
  25,
  'BF',
  '{"headline": "Black Friday cleaning deals", "cta": "Shop the deal", "countdown": true}'::jsonb,
  '{}'::jsonb,
  '{"tone": "urgent", "focus": "biggest savings of the year"}'::jsonb,
  60
),
(
  'christmas',
  'Christmas',
  'Festive season home cleaning offers.',
  'christmas',
  'seasonal',
  'percent',
  15,
  'XMAS',
  '{"headline": "Festive home, less stress", "cta": "Book festive clean", "countdown": true}'::jsonb,
  '{}'::jsonb,
  '{"tone": "warm", "focus": "holiday readiness"}'::jsonb,
  70
),
(
  'womens_month',
  'Women''s Month',
  'August Women''s Month appreciation offer.',
  'womens_month',
  'seasonal',
  'percent',
  15,
  'WOMEN',
  '{"headline": "Celebrating Women''s Month", "cta": "Claim your offer", "countdown": true}'::jsonb,
  '{}'::jsonb,
  '{"tone": "appreciative", "focus": "self-care and time back"}'::jsonb,
  80
),
(
  'spring_cleaning',
  'Spring Cleaning',
  'Seasonal deep-clean push.',
  'spring_cleaning',
  'seasonal',
  'percent',
  10,
  'SPRING',
  '{"headline": "Spring Cleaning Special", "cta": "Book spring clean", "countdown": true}'::jsonb,
  '{}'::jsonb,
  '{"tone": "fresh", "focus": "renewal and deep clean"}'::jsonb,
  90
),
(
  'move_out',
  'Move Out Clean',
  'End-of-lease / move-out cleaning offer.',
  'move_out',
  'seasonal',
  'percent',
  10,
  'MOVE',
  '{"headline": "Move-out cleaning made easy", "cta": "Book move-out clean"}'::jsonb,
  '{}'::jsonb,
  '{"tone": "practical", "focus": "deposit-ready homes"}'::jsonb,
  100
),
(
  'airbnb',
  'Airbnb Turnover',
  'Short-stay / Airbnb turnover cleaning offer.',
  'airbnb',
  'seasonal',
  'percent',
  10,
  'AIRBNB',
  '{"headline": "Guest-ready turnovers", "cta": "Book turnover clean"}'::jsonb,
  '{}'::jsonb,
  '{"tone": "professional", "focus": "fast reliable turnovers"}'::jsonb,
  110
)
on conflict (key) do update set
  name = excluded.name,
  description = excluded.description,
  default_display_config = excluded.default_display_config,
  updated_at = now();
