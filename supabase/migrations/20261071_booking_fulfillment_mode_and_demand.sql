-- Phase A soft fulfillment: ops-assignable reserves + area review leads + demand logging.
-- Does not change existing pending_assignment (selected-cleaner offer) semantics.

alter table public.bookings
  add column if not exists fulfillment_mode text;

alter table public.bookings
  add column if not exists fulfillment_reason text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'bookings_fulfillment_mode_check'
  ) then
    alter table public.bookings
      add constraint bookings_fulfillment_mode_check
      check (
        fulfillment_mode is null
        or fulfillment_mode in ('instant', 'ops_assignment', 'area_review')
      );
  end if;
end $$;

comment on column public.bookings.fulfillment_mode is
  'How checkout accepted the booking: instant (eligible cleaner), ops_assignment (paid reserve for ops), area_review (unpaid expansion lead).';

comment on column public.bookings.fulfillment_reason is
  'Short machine reason for fulfillment_mode (ops/analytics).';

-- Do not mass-UPDATE existing rows here: bookings UPDATE triggers (e.g. payout owner
-- team membership) can fail on legacy team rows. New checkouts write fulfillment_mode
-- explicitly; null remains valid for legacy rows.

create index if not exists bookings_fulfillment_mode_status_idx
  on public.bookings (fulfillment_mode, status)
  where fulfillment_mode is not null;

comment on column public.bookings.status is
  'Lifecycle status (text). Includes area_review for unpaid expansion leads. Legacy confirmed normalizes to assigned in app code. pending_assignment remains selected-cleaner offer wait.';

create table if not exists public.booking_demand_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  event_type text not null,
  suburb text,
  city text,
  postal_code text,
  location_id uuid,
  service_slug text,
  service_label text,
  requested_date text,
  requested_time text,
  fulfillment_mode text,
  booking_id uuid references public.bookings (id) on delete set null,
  user_id uuid,
  source text,
  metadata jsonb not null default '{}'::jsonb,
  constraint booking_demand_events_event_type_check check (
    event_type in (
      'slot_exhausted',
      'ops_reserve_started',
      'area_review_started',
      'area_review_converted',
      'cancelled'
    )
  ),
  constraint booking_demand_events_fulfillment_mode_check check (
    fulfillment_mode is null
    or fulfillment_mode in ('instant', 'ops_assignment', 'area_review')
  )
);

create index if not exists booking_demand_events_created_at_idx
  on public.booking_demand_events (created_at desc);

create index if not exists booking_demand_events_location_date_idx
  on public.booking_demand_events (location_id, requested_date);

create index if not exists booking_demand_events_suburb_idx
  on public.booking_demand_events (suburb);

create index if not exists booking_demand_events_service_idx
  on public.booking_demand_events (service_slug);

create index if not exists booking_demand_events_mode_created_idx
  on public.booking_demand_events (fulfillment_mode, created_at desc);

alter table public.booking_demand_events enable row level security;

-- Service role / admin APIs only; no anon/authenticated policies by design.
