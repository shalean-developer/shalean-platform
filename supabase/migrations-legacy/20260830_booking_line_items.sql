-- Phase 1: immutable per-booking charge lines (dual-write with bookings.extras / snapshot).
-- Service role inserts from API; authenticated read via booking ownership / assignment.

create table if not exists public.booking_line_items (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  item_type text not null,
  slug text,
  name text not null,
  quantity integer not null default 1,
  unit_price_cents integer not null,
  total_price_cents integer not null,
  pricing_source text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint booking_line_items_item_type_check check (
    item_type in ('base', 'room', 'bathroom', 'extra', 'adjustment')
  ),
  constraint booking_line_items_quantity_positive check (quantity >= 1)
);

create index if not exists booking_line_items_booking_id_idx
  on public.booking_line_items (booking_id);

comment on table public.booking_line_items is
  'Immutable snapshot of billable components at booking creation time (ZAR minor units = cents).';

comment on column public.booking_line_items.pricing_source is
  'e.g. home_widget_catalog_v1, monthly_bundled_zar_v1';

alter table public.booking_line_items enable row level security;

drop policy if exists booking_line_items_user_select_own on public.booking_line_items;
create policy booking_line_items_user_select_own on public.booking_line_items
  for select to authenticated
  using (
    exists (
      select 1 from public.bookings b
      where b.id = booking_line_items.booking_id and b.user_id = auth.uid()
    )
  );

drop policy if exists booking_line_items_cleaner_select_assigned on public.booking_line_items;
create policy booking_line_items_cleaner_select_assigned on public.booking_line_items
  for select to authenticated
  using (
    exists (
      select 1 from public.bookings b
      where b.id = booking_line_items.booking_id and b.cleaner_id = auth.uid()
    )
  );

-- Inserts/updates only via service role (API); no insert policy for authenticated.
