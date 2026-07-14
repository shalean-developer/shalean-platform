-- AI revenue system: dynamic pricing metrics, slot adjustments, decision logs, user behavior signals

-- ---------------------------------------------------------------------------
-- pricing_metrics: funnel stats per slot (updated by cron + optional app events)
-- ---------------------------------------------------------------------------
create table if not exists public.pricing_metrics (
  slot_time text primary key check (slot_time ~ '^\d{2}:\d{2}$'),
  conversion_rate numeric not null default 0.35 check (conversion_rate >= 0 and conversion_rate <= 1),
  views_count integer not null default 0 check (views_count >= 0),
  bookings_count integer not null default 0 check (bookings_count >= 0),
  drop_offs integer not null default 0 check (drop_offs >= 0),
  updated_at timestamptz not null default now()
);

comment on table public.pricing_metrics is
  'Per–time-slot funnel metrics for dynamic pricing AI (cron reads/writes).';

-- Seed standard booking grid (Johannesburg business hours)
insert into public.pricing_metrics (slot_time, conversion_rate)
values
  ('08:00', 0.35),
  ('09:00', 0.38),
  ('10:00', 0.40),
  ('11:00', 0.36),
  ('12:00', 0.33),
  ('13:00', 0.34),
  ('14:00', 0.35),
  ('15:00', 0.32),
  ('16:00', 0.30)
on conflict (slot_time) do nothing;

-- ---------------------------------------------------------------------------
-- pricing_slot_adjustments: AI multiplier applied on top of base demand surge (±20% cap in app)
-- ---------------------------------------------------------------------------
create table if not exists public.pricing_slot_adjustments (
  slot_time text primary key references public.pricing_metrics (slot_time) on delete cascade,
  multiplier numeric not null default 1.0 check (multiplier >= 0.8 and multiplier <= 1.2),
  updated_at timestamptz not null default now()
);

insert into public.pricing_slot_adjustments (slot_time, multiplier)
select slot_time, 1.0 from public.pricing_metrics
on conflict (slot_time) do nothing;

-- ---------------------------------------------------------------------------
-- ai_decision_logs: audit trail for pricing optimizer and agent actions
-- ---------------------------------------------------------------------------
create table if not exists public.ai_decision_logs (
  id uuid primary key default gen_random_uuid(),
  decision_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ai_decision_logs_type_created_idx
  on public.ai_decision_logs (decision_type, created_at desc);

comment on table public.ai_decision_logs is 'AI / pricing decisions for compliance and offline analysis.';

-- ---------------------------------------------------------------------------
-- user_behavior: aggregated learning signals (extras prefs, repeat patterns)
-- ---------------------------------------------------------------------------
create table if not exists public.user_behavior (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  session_id text,
  signal_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists user_behavior_user_created_idx
  on public.user_behavior (user_id, created_at desc);

create index if not exists user_behavior_signal_idx
  on public.user_behavior (signal_type, created_at desc);

comment on table public.user_behavior is 'Optional learning signals; complements user_events.';

alter table public.pricing_metrics enable row level security;
alter table public.pricing_slot_adjustments enable row level security;
alter table public.ai_decision_logs enable row level security;
alter table public.user_behavior enable row level security;

-- ---------------------------------------------------------------------------
-- Extend user_events for funnel / agent analytics (service role + existing inserts)
-- ---------------------------------------------------------------------------
alter table public.user_events drop constraint if exists user_events_event_type_check;

alter table public.user_events
  add constraint user_events_event_type_check
  check (
    event_type in (
      'booking_created',
      'booking_completed',
      'slot_selected',
      'extra_added',
      'recommendation_clicked',
      'flow_step_viewed',
      'flow_drop_off',
      'booking_agent_quote',
      'booking_agent_confirm'
    )
  );
