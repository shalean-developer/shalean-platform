-- Extra index on item_type + optional totals cache (safe additive migration).
-- booking_id is already indexed by booking_line_items_booking_id_idx (20260830).

create index if not exists idx_bli_type on public.booking_line_items (item_type);

create table if not exists public.booking_totals (
  booking_id uuid primary key references public.bookings (id) on delete cascade,
  subtotal_cents integer,
  cleaner_earnings_cents integer,
  platform_fee_cents integer,
  updated_at timestamptz not null default now()
);

comment on table public.booking_totals is
  'Optional denormalized totals; populated later when reads move off JSON.';

alter table public.booking_totals enable row level security;

drop policy if exists booking_totals_user_select_own on public.booking_totals;
create policy booking_totals_user_select_own on public.booking_totals
  for select to authenticated
  using (
    exists (
      select 1 from public.bookings b
      where b.id = booking_totals.booking_id and b.user_id = auth.uid()
    )
  );

drop policy if exists booking_totals_cleaner_select_assigned on public.booking_totals;
create policy booking_totals_cleaner_select_assigned on public.booking_totals
  for select to authenticated
  using (
    exists (
      select 1 from public.bookings b
      where b.id = booking_totals.booking_id and b.cleaner_id = auth.uid()
    )
  );
