-- Stage 19 pre-scale: unified analytics_session correlation + warehouse-style rollup stubs.

-- ---------------------------------------------------------------------------
-- booking_events: universal session correlation (mirrors user_events.payload.analytics_session_id)
-- ---------------------------------------------------------------------------
alter table public.booking_events
  add column if not exists analytics_session_id text;

create index if not exists booking_events_analytics_session_id_idx
  on public.booking_events (analytics_session_id);

comment on column public.booking_events.analytics_session_id is
  'Cross-table analytics session id (browser-stable); pairs with user_events.payload.analytics_session_id';

-- ---------------------------------------------------------------------------
-- Daily aggregates (filled by scheduled job / Edge Function — not auto-populated here)
-- ---------------------------------------------------------------------------
create table if not exists public.daily_booking_funnel_metrics (
  day date primary key,
  quote_starts integer not null default 0,
  payment_reached integer not null default 0,
  booking_completed_signals integer not null default 0,
  paystack_opened integer not null default 0,
  paystack_completed integer not null default 0,
  unique_sessions integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.daily_conversion_metrics (
  day date primary key,
  booking_started integer not null default 0,
  booking_completed integer not null default 0,
  payment_initiated integer not null default 0,
  payment_completed integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.daily_payment_metrics (
  day date primary key,
  paystack_opened integer not null default 0,
  payment_failed_signals integer not null default 0,
  abandonment_pct numeric,
  updated_at timestamptz not null default now()
);

create table if not exists public.daily_service_metrics (
  day date not null,
  service_slug text not null default '',
  booking_starts integer not null default 0,
  completions integer not null default 0,
  revenue_zar numeric not null default 0,
  updated_at timestamptz not null default now(),
  primary key (day, service_slug)
);

comment on table public.daily_booking_funnel_metrics is
  'Pre-aggregated booking funnel KPIs; populate via cron from booking_events + user_events.';
comment on table public.daily_conversion_metrics is
  'Pre-aggregated conversion counts from user_events canonical types.';
comment on table public.daily_payment_metrics is
  'Payment funnel health snapshot per UTC day.';
comment on table public.daily_service_metrics is
  'Per-service conversion/revenue rollup per day.';

alter table public.daily_booking_funnel_metrics enable row level security;
alter table public.daily_conversion_metrics enable row level security;
alter table public.daily_payment_metrics enable row level security;
alter table public.daily_service_metrics enable row level security;

-- ---------------------------------------------------------------------------
-- Materialized views (refresh on schedule; initial CREATE empty-friendly)
-- ---------------------------------------------------------------------------
drop materialized view if exists public.mv_booking_funnel_daily;
create materialized view public.mv_booking_funnel_daily as
select
  (created_at at time zone 'UTC')::date as day,
  count(*) filter (
    where step = 'quote' and event_type = 'view'
  ) as quote_views,
  count(*) filter (
    where step = 'payment' and event_type in ('view', 'next')
  ) as payment_step_reached,
  count(*) filter (where event_type = 'exit') as exits,
  count(*) filter (where event_type = 'error') as errors,
  count(distinct coalesce(analytics_session_id, session_id)) as distinct_sessions
from public.booking_events
group by 1;

create unique index if not exists mv_booking_funnel_daily_day_uidx on public.mv_booking_funnel_daily (day);

drop materialized view if exists public.mv_payment_conversion_daily;
create materialized view public.mv_payment_conversion_daily as
select
  (created_at at time zone 'UTC')::date as day,
  count(*) filter (where event_type = 'booking_paystack_opened') as paystack_opened,
  count(*) filter (where event_type = 'booking_completed') as booking_completed_events,
  count(*) filter (where event_type = 'payment_completed') as payment_completed_events
from public.user_events
group by 1;

create unique index if not exists mv_payment_conversion_daily_day_uidx on public.mv_payment_conversion_daily (day);

comment on materialized view public.mv_booking_funnel_daily is
  'Refresh via REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_booking_funnel_daily; schedule nightly.';
comment on materialized view public.mv_payment_conversion_daily is
  'Refresh via REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_payment_conversion_daily; schedule nightly.';
