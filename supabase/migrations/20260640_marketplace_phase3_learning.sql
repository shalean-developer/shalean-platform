-- Phase 3 → 100%: outcome learning, cluster hints, optional forecast snapshot on booking.

alter table public.cleaners
  add column if not exists marketplace_outcome_ema double precision;

alter table public.cleaners
  add column if not exists marketplace_outcome_samples int not null default 0;

comment on column public.cleaners.marketplace_outcome_ema is
  'Exponential moving average of assignment outcome scores (0–1); feeds marketplace scoring when set.';

comment on column public.cleaners.marketplace_outcome_samples is
  'Count of completed jobs used to build marketplace_outcome_ema.';

alter table public.bookings
  add column if not exists assignment_outcome_score double precision;

alter table public.bookings
  add column if not exists marketplace_cluster_id text;

alter table public.bookings
  add column if not exists marketplace_forecast_demand text;

comment on column public.bookings.assignment_outcome_score is
  'Observed outcome quality after completion (on-time + review blend); used for cleaner EMA learning.';

comment on column public.bookings.marketplace_cluster_id is
  'Stable geo/time cluster key for routing + affinity dispatch.';

comment on column public.bookings.marketplace_forecast_demand is
  'Optional snapshot: low|medium|high from forecastDemand at quote/assign time.';
