-- Weekly (or ad-hoc) aggregates for dispatch UX experiment trends.
-- Populate from a scheduled job, admin script, or future API — table is schema-only here.

create table if not exists public.dispatch_experiment_snapshots (
  id uuid primary key default gen_random_uuid(),
  week_start date not null,
  ux_variant text not null
    check (ux_variant in ('control', 'sound_on', 'high_urgency', 'cta_v2')),
  p95_time_to_accept_ms double precision,
  accept_rate double precision,
  offers_per_booking double precision,
  resolved_offers integer,
  created_at timestamptz not null default now(),
  unique (week_start, ux_variant)
);

create index if not exists dispatch_experiment_snapshots_week_start_desc_idx
  on public.dispatch_experiment_snapshots (week_start desc);

comment on table public.dispatch_experiment_snapshots is
  'Point-in-time dispatch experiment KPIs by calendar week and ux_variant; optional trend store (writer: service role / cron).';

alter table public.dispatch_experiment_snapshots enable row level security;

revoke all on public.dispatch_experiment_snapshots from public;
revoke all on public.dispatch_experiment_snapshots from anon;
revoke all on public.dispatch_experiment_snapshots from authenticated;
grant select, insert, update, delete on public.dispatch_experiment_snapshots to service_role;
