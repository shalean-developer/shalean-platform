create table if not exists public.system_metrics (
  id uuid primary key default gen_random_uuid(),
  metric text not null,
  value numeric not null default 1,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists system_metrics_metric_created_idx
  on public.system_metrics (metric, created_at desc);

comment on table public.system_metrics is 'Optional numeric counters / audit points (Day 7 observability).';

alter table public.system_metrics enable row level security;
