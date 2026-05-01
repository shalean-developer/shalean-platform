-- Hardening: fingerprint (guest/device), reconciliation flag, per-code limits, DB-enforced caps, admin summary view.

-- ---------------------------------------------------------------------------
-- Bookings: flag when Paystack succeeded but referral redemption could not persist
-- ---------------------------------------------------------------------------
alter table public.bookings
  add column if not exists referral_reconciliation_required boolean not null default false;

comment on column public.bookings.referral_reconciliation_required is
  'Set when checkout used a referral discount but post-payment redemption insert failed (non-idempotent); ops/finance review.';

-- ---------------------------------------------------------------------------
-- Redemptions: device fingerprint for guest abuse (parallel with email uniqueness)
-- ---------------------------------------------------------------------------
alter table public.referral_discount_redemptions
  add column if not exists checkout_fingerprint text;

comment on column public.referral_discount_redemptions.checkout_fingerprint is
  'SHA-256 hex of client IP + User-Agent at Paystack initialize; optional unique with referral_code for guests.';

create unique index if not exists referral_discount_redemptions_code_fingerprint_uidx
  on public.referral_discount_redemptions (referral_code, checkout_fingerprint)
  where checkout_fingerprint is not null and length(trim(checkout_fingerprint)) > 0;

-- ---------------------------------------------------------------------------
-- Per-referrer limits (nullable = unlimited / no expiry)
-- ---------------------------------------------------------------------------
alter table public.user_profiles
  add column if not exists referral_code_expires_at timestamptz,
  add column if not exists referral_code_max_uses int;

alter table public.cleaners
  add column if not exists referral_code_expires_at timestamptz,
  add column if not exists referral_code_max_uses int;

comment on column public.user_profiles.referral_code_expires_at is
  'When set, checkout discounts using this customer referral code are rejected after this instant.';
comment on column public.user_profiles.referral_code_max_uses is
  'When set, max successful checkout redemptions for this code (global count).';

-- ---------------------------------------------------------------------------
-- BEFORE INSERT: expiry + max uses (authoritative vs race at initialize)
-- ---------------------------------------------------------------------------
create or replace function public.referral_discount_redemptions_enforce_limits()
returns trigger
language plpgsql
as $$
declare
  cap int;
  exp_at timestamptz;
  cnt int;
begin
  select p.referral_code_max_uses, p.referral_code_expires_at
  into cap, exp_at
  from public.user_profiles p
  where p.referral_code = new.referral_code
  limit 1;

  if found then
    if exp_at is not null and exp_at < now() then
      raise exception 'referral_code_expired' using errcode = '23514';
    end if;
    if cap is not null and cap > 0 then
      select count(*)::int into cnt
      from public.referral_discount_redemptions
      where referral_code = new.referral_code;
      if cnt >= cap then
        raise exception 'referral_code_max_uses_reached' using errcode = '23514';
      end if;
    end if;
    return new;
  end if;

  select c.referral_code_max_uses, c.referral_code_expires_at
  into cap, exp_at
  from public.cleaners c
  where c.referral_code = new.referral_code
  limit 1;

  if found then
    if exp_at is not null and exp_at < now() then
      raise exception 'referral_code_expired' using errcode = '23514';
    end if;
    if cap is not null and cap > 0 then
      select count(*)::int into cnt
      from public.referral_discount_redemptions
      where referral_code = new.referral_code;
      if cnt >= cap then
        raise exception 'referral_code_max_uses_reached' using errcode = '23514';
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists referral_discount_redemptions_enforce_limits_trg on public.referral_discount_redemptions;

create trigger referral_discount_redemptions_enforce_limits_trg
  before insert on public.referral_discount_redemptions
  for each row
  execute function public.referral_discount_redemptions_enforce_limits();

-- ---------------------------------------------------------------------------
-- Admin reporting (service role / dashboard)
-- ---------------------------------------------------------------------------
create or replace view public.admin_referral_checkout_redemption_summary as
select
  referral_code,
  count(*)::bigint as redemption_count,
  coalesce(sum(discount_zar), 0)::bigint as total_discount_zar
from public.referral_discount_redemptions
group by referral_code;

comment on view public.admin_referral_checkout_redemption_summary is
  'Aggregated checkout referral discount cost per code (admin / ops).';
