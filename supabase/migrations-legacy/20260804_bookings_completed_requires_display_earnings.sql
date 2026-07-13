-- Financial integrity: a booking in `completed` status must have `display_earnings_cents` set (0 is valid).
--
-- 1) Repair legacy rows so VALIDATE can succeed (same basis as app fallback: cleaner_payout_cents, else 0).
-- 2) Add + validate CHECK constraint.

-- ---------------------------------------------------------------------------
-- Data repair (required before VALIDATE — avoids 23514)
-- ---------------------------------------------------------------------------
update public.bookings
set display_earnings_cents = case
    when cleaner_payout_cents is not null then greatest(0, cleaner_payout_cents)
    else 0
  end
where lower(trim(coalesce(status, ''))) = 'completed'
  and display_earnings_cents is null;

-- ---------------------------------------------------------------------------
-- Constraint
-- ---------------------------------------------------------------------------
alter table public.bookings
  drop constraint if exists bookings_completed_requires_display_earnings;

alter table public.bookings
  add constraint bookings_completed_requires_display_earnings
  check (
    lower(trim(coalesce(status, ''))) is distinct from 'completed'
    or display_earnings_cents is not null
  )
  not valid;

alter table public.bookings validate constraint bookings_completed_requires_display_earnings;

comment on constraint bookings_completed_requires_display_earnings on public.bookings is
  'Completed bookings must have display_earnings_cents populated (including 0 for free/promo jobs).';
