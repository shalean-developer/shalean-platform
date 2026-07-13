-- Phase 5: AI autonomy layer — feature store, decision logs, experiments, incremental model weights.
-- App code wraps rule engines; service role writes telemetry (RLS on, no broad policies).

-- ---------------------------------------------------------------------------
-- Feature store (entity snapshots for explainable scoring; optional materialization)
-- ---------------------------------------------------------------------------
create table if not exists public.ai_feature_store (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('booking', 'cleaner', 'customer')),
  entity_id uuid not null,
  feature_key text not null,
  feature_value jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ai_feature_store_entity_idx
  on public.ai_feature_store (entity_type, entity_id, feature_key, created_at desc);

create index if not exists ai_feature_store_key_created_idx
  on public.ai_feature_store (feature_key, created_at desc);

comment on table public.ai_feature_store is
  'Materialized features per entity (conversion, LTV, segment, acceptance, workload, booking context). Fed by app sync; optional for cold-start paths.';

alter table public.ai_feature_store enable row level security;

-- ---------------------------------------------------------------------------
-- Every AI-influenced decision (audit + learning loop)
-- ---------------------------------------------------------------------------
create table if not exists public.ai_decision_logs (
  id uuid primary key default gen_random_uuid(),
  decision_type text not null,
  context jsonb not null default '{}'::jsonb,
  prediction jsonb,
  chosen_action jsonb not null default '{}'::jsonb,
  outcome jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ai_decision_logs_type_created_idx
  on public.ai_decision_logs (decision_type, created_at desc);

comment on table public.ai_decision_logs is
  'Explainable AI layer: inputs, model outputs, chosen action, optional measured outcome for updateModelWeights.';

alter table public.ai_decision_logs enable row level security;

-- ---------------------------------------------------------------------------
-- Experiment exposures (deterministic rollout + audit)
-- ---------------------------------------------------------------------------
create table if not exists public.ai_experiment_exposures (
  id uuid primary key default gen_random_uuid(),
  subject_id text not null,
  experiment_key text not null,
  variant text not null check (variant in ('control', 'variant')),
  rollout_percent int not null check (rollout_percent >= 0 and rollout_percent <= 100),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ai_experiment_exposures_subject_exp_idx
  on public.ai_experiment_exposures (subject_id, experiment_key, created_at desc);

create unique index if not exists ai_experiment_exposures_dedupe_once_idx
  on public.ai_experiment_exposures (subject_id, experiment_key);

comment on table public.ai_experiment_exposures is
  'Stable A/B assignment per subject+experiment; first exposure wins (unique index).';

alter table public.ai_experiment_exposures enable row level security;

-- ---------------------------------------------------------------------------
-- Incremental scalar / vector weights (no external ML infra)
-- ---------------------------------------------------------------------------
create table if not exists public.ai_model_weights (
  decision_scope text primary key check (decision_scope in ('pricing', 'assignment', 'growth')),
  weights jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

insert into public.ai_model_weights (decision_scope, weights)
values
  ('pricing', '{"priceSensitivity":1,"segmentBias":1,"timeBias":1,"channelBias":1}'::jsonb),
  ('assignment', '{"acceptanceBlend":1,"miScoreBlend":1,"emaBlend":1}'::jsonb),
  ('growth', '{"discountRoiPrior":0.35,"upsellRoiPrior":0.42,"nothingRoiPrior":0.05}'::jsonb)
on conflict (decision_scope) do nothing;

comment on table public.ai_model_weights is
  'Lightweight tunable weights merged in TS with rule baselines; updated by updateModelWeights from outcomes.';

alter table public.ai_model_weights enable row level security;
