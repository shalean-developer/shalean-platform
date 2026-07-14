create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null,
  referrer_type text not null check (referrer_type in ('customer', 'cleaner')),
  referred_email_or_phone text not null,
  referred_user_id uuid references auth.users (id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'completed')),
  reward_amount numeric not null default 0 check (reward_amount >= 0),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists referrals_referrer_idx
  on public.referrals (referrer_type, referrer_id, created_at desc);
create index if not exists referrals_referred_user_idx
  on public.referrals (referred_user_id, status);
create index if not exists referrals_contact_idx
  on public.referrals (referred_email_or_phone, status);
create unique index if not exists referrals_completed_once_per_referred_type_idx
  on public.referrals (referrer_type, referred_email_or_phone)
  where status = 'completed';

alter table public.user_profiles
  add column if not exists referral_code text unique,
  add column if not exists credit_balance_zar numeric not null default 0;

alter table public.cleaners
  add column if not exists referral_code text unique,
  add column if not exists bonus_payout_zar numeric not null default 0;
