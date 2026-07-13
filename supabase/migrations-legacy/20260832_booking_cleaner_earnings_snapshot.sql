-- Per-booking earnings derived from `booking_line_items` (audit + future reads).
-- Does NOT replace `public.cleaner_payouts` (weekly batch runs) — different concern.

create table if not exists public.booking_cleaner_earnings_snapshot (
  booking_id uuid primary key references public.bookings (id) on delete cascade,
  cleaner_id uuid not null references public.cleaners (id) on delete restrict,
  eligible_subtotal_cents integer not null,
  display_earnings_cents integer not null check (display_earnings_cents >= 0),
  payout_earnings_cents integer not null check (payout_earnings_cents >= 0),
  internal_earnings_cents integer not null check (internal_earnings_cents >= 0),
  earnings_model_version text,
  earnings_percentage_applied numeric(6, 5),
  earnings_cap_cents_applied integer,
  earnings_tenure_months_at_assignment integer,
  model_version text not null default 'line_items_basis_v1',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.booking_cleaner_earnings_snapshot_lines (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  booking_line_item_id uuid not null references public.booking_line_items (id) on delete cascade,
  allocated_display_earnings_cents integer not null,
  unique (booking_line_item_id)
);

create index if not exists idx_bces_cleaner on public.booking_cleaner_earnings_snapshot (cleaner_id);
create index if not exists idx_bcesl_booking on public.booking_cleaner_earnings_snapshot_lines (booking_id);

comment on table public.booking_cleaner_earnings_snapshot is
  'Frozen cleaner earnings for a booking when computed from booking_line_items + same caps/tenure as computeBookingEarnings.';

alter table public.booking_cleaner_earnings_snapshot enable row level security;
alter table public.booking_cleaner_earnings_snapshot_lines enable row level security;

drop policy if exists bces_user_select on public.booking_cleaner_earnings_snapshot;
create policy bces_user_select on public.booking_cleaner_earnings_snapshot
  for select to authenticated
  using (
    exists (
      select 1 from public.bookings b
      where b.id = booking_cleaner_earnings_snapshot.booking_id and b.user_id = auth.uid()
    )
  );

drop policy if exists bces_cleaner_select on public.booking_cleaner_earnings_snapshot;
create policy bces_cleaner_select on public.booking_cleaner_earnings_snapshot
  for select to authenticated
  using (cleaner_id = auth.uid());

drop policy if exists bcesl_user_select on public.booking_cleaner_earnings_snapshot_lines;
create policy bcesl_user_select on public.booking_cleaner_earnings_snapshot_lines
  for select to authenticated
  using (
    exists (
      select 1 from public.bookings b
      where b.id = booking_cleaner_earnings_snapshot_lines.booking_id and b.user_id = auth.uid()
    )
  );

drop policy if exists bcesl_cleaner_select on public.booking_cleaner_earnings_snapshot_lines;
create policy bcesl_cleaner_select on public.booking_cleaner_earnings_snapshot_lines
  for select to authenticated
  using (
    exists (
      select 1 from public.bookings b
      where b.id = booking_cleaner_earnings_snapshot_lines.booking_id and b.cleaner_id = auth.uid()
    )
  );
