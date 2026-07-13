-- Checkout referral discount: record consumption after successful Paystack payment (server-enforced at init).

create table if not exists public.referral_discount_redemptions (
  id uuid primary key default gen_random_uuid(),
  referral_code text not null,
  referrer_type text not null check (referrer_type in ('customer', 'cleaner')),
  referrer_id uuid not null,
  redeemed_by_user_id uuid references auth.users (id) on delete set null,
  redeemed_by_email text,
  booking_id uuid not null references public.bookings (id) on delete cascade,
  discount_zar int not null default 50 check (discount_zar > 0),
  created_at timestamptz not null default now(),
  constraint referral_discount_redemptions_email_lower_chk
    check (redeemed_by_email is null or redeemed_by_email = lower(redeemed_by_email))
);

comment on table public.referral_discount_redemptions is
  'One successful Paystack checkout discount per (code, user) or (code, guest email); booking_id is unique for idempotent verify.';

create unique index if not exists referral_discount_redemptions_booking_id_uidx
  on public.referral_discount_redemptions (booking_id);

create unique index if not exists referral_discount_redemptions_code_user_uidx
  on public.referral_discount_redemptions (referral_code, redeemed_by_user_id)
  where redeemed_by_user_id is not null;

create unique index if not exists referral_discount_redemptions_code_email_uidx
  on public.referral_discount_redemptions (referral_code, redeemed_by_email)
  where redeemed_by_email is not null;

create index if not exists referral_discount_redemptions_referrer_idx
  on public.referral_discount_redemptions (referrer_type, referrer_id, created_at desc);

alter table public.referral_discount_redemptions enable row level security;
