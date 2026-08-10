create table if not exists public.seo_web_vitals_snapshots (
  id uuid primary key default gen_random_uuid(),
  url text not null,
  path text not null,
  page_group text,
  priority text not null default 'P2',
  device text not null check (device in ('mobile','desktop')),
  measured_at timestamptz not null default now(),
  performance_score numeric,
  field_lcp_ms numeric,
  field_inp_ms numeric,
  field_cls numeric,
  field_source text,
  lab_lcp_ms numeric,
  lab_cls numeric,
  lab_tbt_ms numeric,
  status text not null default 'unknown' check (status in ('good','needs_improvement','poor','unknown')),
  regression_detected boolean not null default false,
  regression_reason text,
  raw jsonb
);
create index if not exists seo_web_vitals_lookup_idx on public.seo_web_vitals_snapshots(path,device,measured_at desc);
create index if not exists seo_web_vitals_regression_idx on public.seo_web_vitals_snapshots(regression_detected,measured_at desc) where regression_detected;
alter table public.seo_web_vitals_snapshots enable row level security;
revoke all on public.seo_web_vitals_snapshots from anon, authenticated;
grant all on public.seo_web_vitals_snapshots to service_role;
