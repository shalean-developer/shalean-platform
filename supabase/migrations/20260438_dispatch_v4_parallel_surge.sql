-- Dispatch v4: parallel offers per booking, surge fields, travel cache, cleaner intelligence

-- Allow multiple pending offers per booking (different cleaners)
drop index if exists public.dispatch_offers_one_pending_per_booking_uidx;

create unique index if not exists dispatch_offers_booking_cleaner_pending_uidx
  on public.dispatch_offers (booking_id, cleaner_id)
  where status = 'pending';

comment on table public.dispatch_offers is 'Soft assign: multiple pending offers per booking (race); unique pending per (booking, cleaner).';

-- Cleaner intelligence
alter table public.cleaners
  add column if not exists avg_response_time_ms double precision,
  add column if not exists last_response_at timestamptz,
  add column if not exists acceptance_rate_recent real not null default 1.0
    check (acceptance_rate_recent >= 0 and acceptance_rate_recent <= 1),
  add column if not exists tier text not null default 'bronze'
    check (tier in ('gold', 'silver', 'bronze'));

comment on column public.cleaners.avg_response_time_ms is 'EWMA of offer response latency (ms); null until first response.';
comment on column public.cleaners.acceptance_rate_recent is 'EWMA of recent offer outcomes (proxy for last-7d behavior).';

-- Surge / demand on booking (set at creation / payment; defaults keep legacy rows valid)
alter table public.bookings
  add column if not exists surge_multiplier real not null default 1.0 check (surge_multiplier > 0),
  add column if not exists demand_level text not null default 'normal'
    check (demand_level in ('low', 'normal', 'peak'));

comment on column public.bookings.surge_multiplier is 'Pricing / dispatch weighting (1 = baseline).';
comment on column public.bookings.demand_level is 'Supply-demand hint: low | normal | peak.';

-- Travel time cache (area-to-area, minutes)
create table if not exists public.travel_route_cache (
  origin_location_id uuid not null references public.locations (id) on delete cascade,
  dest_location_id uuid not null references public.locations (id) on delete cascade,
  minutes real not null check (minutes >= 0),
  expires_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (origin_location_id, dest_location_id)
);

create index if not exists travel_route_cache_expires_idx on public.travel_route_cache (expires_at);

comment on table public.travel_route_cache is 'Dispatch: cached drive-time minutes between area centroids; TTL 10–30m.';

alter table public.travel_route_cache enable row level security;

-- Expire sibling offers when one wins (service role / security definer)
create or replace function public.dispatch_expire_peer_offers(p_booking_id uuid, p_winner_offer_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.dispatch_offers
  set
    status = 'expired',
    responded_at = now()
  where booking_id = p_booking_id
    and status = 'pending'
    and id <> p_winner_offer_id;
end;
$$;

-- Response metrics: EWMA latency + recent acceptance EWMA
create or replace function public.dispatch_record_offer_response(
  p_cleaner_id uuid,
  p_latency_ms double precision,
  p_accepted boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  old_avg double precision;
  new_avg double precision;
  old_recent real;
  new_recent real;
begin
  select avg_response_time_ms, acceptance_rate_recent
    into old_avg, old_recent
  from public.cleaners
  where id = p_cleaner_id;

  if old_avg is null or old_avg <= 0 then
    new_avg := greatest(p_latency_ms, 0.0);
  else
    new_avg := old_avg * 0.8 + p_latency_ms * 0.2;
  end if;

  old_recent := coalesce(old_recent, 1.0::real);
  new_recent := (old_recent * 0.7::real + (case when p_accepted then 1.0 else 0.0 end)::real * 0.3::real);
  new_recent := least(1.0::real, greatest(0.0::real, new_recent));

  update public.cleaners
  set
    avg_response_time_ms = new_avg,
    last_response_at = now(),
    acceptance_rate_recent = new_recent
  where id = p_cleaner_id;
end;
$$;
