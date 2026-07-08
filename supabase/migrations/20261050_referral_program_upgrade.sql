-- Referral program upgrade: settings, form submissions, credit ledger, email campaigns.

-- ─── Program settings (singleton) ─────────────────────────────────────────────
create table if not exists public.referral_program_settings (
  id text primary key default 'default' check (id = 'default'),
  enabled boolean not null default true,
  reward_amount_zar numeric not null default 50 check (reward_amount_zar >= 0),
  checkout_discount_zar numeric not null default 50 check (checkout_discount_zar >= 0),
  min_booking_value_zar numeric not null default 0 check (min_booking_value_zar >= 0),
  reward_on text not null default 'first_paid_booking'
    check (reward_on in ('first_paid_booking', 'first_completed_booking')),
  reward_expiry_days int check (reward_expiry_days is null or reward_expiry_days > 0),
  max_rewards_per_customer int check (max_rewards_per_customer is null or max_rewards_per_customer > 0),
  allow_multiple_referrals boolean not null default true,
  eligible_service_categories text[] not null default '{}',
  hero_headline text not null default 'Love Our Cleaning? Get Rewarded for Sharing Shalean!',
  hero_subheading text not null default 'Refer your friends, neighbours, family members, or colleagues. When they complete their first cleaning with Shalean, you''ll earn Cleaning Credit towards your next booking.',
  promotional_text text,
  terms_and_conditions text,
  updated_at timestamptz not null default now()
);

insert into public.referral_program_settings (id)
values ('default')
on conflict (id) do nothing;

-- ─── Form submissions ─────────────────────────────────────────────────────────
create table if not exists public.referral_submissions (
  id uuid primary key default gen_random_uuid(),
  referrer_name text not null,
  referrer_phone text not null,
  referrer_email text not null,
  friend_name text not null,
  friend_phone text not null,
  friend_email text,
  message text,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'expired', 'cancelled')),
  referrer_user_id uuid references auth.users (id) on delete set null,
  referral_id uuid references public.referrals (id) on delete set null,
  admin_notes text,
  reviewed_at timestamptz,
  reviewed_by text,
  created_at timestamptz not null default now()
);

create index if not exists referral_submissions_status_idx
  on public.referral_submissions (status, created_at desc);
create index if not exists referral_submissions_referrer_email_idx
  on public.referral_submissions (lower(referrer_email));

-- ─── Cleaning credit ledger ───────────────────────────────────────────────────
create table if not exists public.cleaning_credit_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  amount_zar numeric not null,
  balance_after_zar numeric not null check (balance_after_zar >= 0),
  type text not null check (type in ('earn', 'spend', 'reverse', 'admin_adjust', 'expire')),
  referral_id uuid references public.referrals (id) on delete set null,
  booking_id uuid references public.bookings (id) on delete set null,
  note text,
  created_by text,
  created_at timestamptz not null default now()
);

create index if not exists cleaning_credit_tx_user_idx
  on public.cleaning_credit_transactions (user_id, created_at desc);

-- ─── Email campaigns (extensible for future campaign types) ───────────────────
create table if not exists public.email_campaigns (
  id uuid primary key default gen_random_uuid(),
  campaign_type text not null default 'referral_monthly'
    check (campaign_type in ('referral_monthly', 'birthday', 'seasonal', 'review_request', 'booking_reminder', 'win_back')),
  name text not null,
  enabled boolean not null default false,
  schedule_cron text not null default '0 9 1 * *',
  subject_template text not null default 'Share Shalean & earn Cleaning Credit!',
  body_html_template text not null,
  audience_filter jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.email_campaign_sends (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.email_campaigns (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  recipient_email text not null,
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'failed', 'bounced', 'skipped')),
  skip_reason text,
  opened_at timestamptz,
  clicked_at timestamptz,
  bounced_at timestamptz,
  sent_at timestamptz,
  error_message text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create unique index if not exists email_campaign_sends_monthly_unique_idx
  on public.email_campaign_sends (campaign_id, recipient_email, (date_trunc('month', created_at at time zone 'UTC')));

create index if not exists email_campaign_sends_campaign_idx
  on public.email_campaign_sends (campaign_id, created_at desc);

-- Seed default referral monthly campaign
insert into public.email_campaigns (
  id,
  campaign_type,
  name,
  enabled,
  subject_template,
  body_html_template
)
values (
  'a0000000-0000-4000-8000-000000000001',
  'referral_monthly',
  'Monthly Referral Encouragement',
  false,
  'Thank you for choosing Shalean. Refer a friend and earn R{{reward_amount}} Cleaning Credit',
  '<p>Hi {{first_name}},</p><p>Thank you for choosing Shalean Cleaning Services!</p><p>Refer a friend and earn <strong>R{{reward_amount}} Cleaning Credit</strong> towards your next booking when they complete their first clean. Rewards are Cleaning Credit only, not cash.</p><p style="text-align:center;margin:32px 0;"><a href="{{referral_link}}" style="display:inline-block;background:#2563eb;color:#fff;padding:14px 28px;border-radius:12px;text-decoration:none;font-weight:600;">Refer a Friend</a></p><p>Your available Cleaning Credit: <strong>R{{available_credit}}</strong></p><p>{{company_name}}</p>'
)
on conflict (id) do nothing;

-- ─── Extend referrals for admin management ────────────────────────────────────
alter table public.referrals
  add column if not exists admin_notes text,
  add column if not exists submission_id uuid references public.referral_submissions (id) on delete set null,
  add column if not exists credit_expires_at timestamptz,
  add column if not exists rejected_at timestamptz,
  add column if not exists rejected_by text;

-- Allow expired/cancelled terminal states (preserve existing pending/completed/rewarded)
alter table public.referrals drop constraint if exists referrals_status_check;
alter table public.referrals
  add constraint referrals_status_check
  check (status in ('pending', 'completed', 'rewarded', 'expired', 'cancelled'));

-- RLS: service_role only for new tables (matches referral admin pattern)
alter table public.referral_program_settings enable row level security;
alter table public.referral_submissions enable row level security;
alter table public.cleaning_credit_transactions enable row level security;
alter table public.email_campaigns enable row level security;
alter table public.email_campaign_sends enable row level security;
