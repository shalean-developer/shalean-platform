-- Per-cleaner payout rows for paired roster jobs (is_team_job = false, 2+ booking_cleaners).
-- Lead continues to use bookings.cleaner_payout_cents + weekly batch via cleaner_id;
-- non-lead members batch through this table.

create table if not exists public.booking_roster_member_payouts (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  cleaner_id uuid not null references public.cleaners (id) on delete restrict,
  payout_cents integer not null check (payout_cents >= 0),
  bonus_cents integer not null default 0 check (bonus_cents >= 0),
  status text not null default 'pending',
  cleaner_payout_id uuid references public.cleaner_payouts (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (booking_id, cleaner_id)
);

create index if not exists booking_roster_member_payouts_booking_id_idx
  on public.booking_roster_member_payouts (booking_id);

create index if not exists booking_roster_member_payouts_cleaner_id_idx
  on public.booking_roster_member_payouts (cleaner_id);

create index if not exists booking_roster_member_payouts_cleaner_payout_id_idx
  on public.booking_roster_member_payouts (cleaner_payout_id)
  where cleaner_payout_id is not null;

comment on table public.booking_roster_member_payouts is
  'Non-lead roster member payout basis for paired solo jobs (booking_cleaners, not formal team jobs).';

alter table public.booking_roster_member_payouts enable row level security;

revoke all on table public.booking_roster_member_payouts from public;
grant select, insert, update, delete on table public.booking_roster_member_payouts to service_role;
