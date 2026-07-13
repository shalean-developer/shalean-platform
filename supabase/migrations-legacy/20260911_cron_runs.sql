-- Append-only cron invocation audit (service role / server inserts from Next.js cron routes)

create table if not exists public.cron_runs (
  id uuid primary key default gen_random_uuid(),
  job_name text not null,
  status text not null check (status in ('success', 'error')),
  message text,
  created_at timestamptz not null default now()
);

create index if not exists cron_runs_job_created_idx on public.cron_runs (job_name, created_at desc);
create index if not exists cron_runs_created_idx on public.cron_runs (created_at desc);

alter table public.cron_runs enable row level security;

comment on table public.cron_runs is 'HTTP cron outcomes (recurring generator/charger and future jobs); written by API routes via service role.';

grant select, insert on public.cron_runs to service_role;

-- Ops health (SQL Editor or admin dashboard):
--
--   SELECT
--     job_name,
--     MAX(created_at) FILTER (WHERE status = 'success') AS last_success_at,
--     MAX(created_at) AS last_run_at,
--     COUNT(*) FILTER (WHERE status = 'error') AS errors_last_24h
--   FROM public.cron_runs
--   WHERE created_at > now() - interval '24 hours'
--   GROUP BY job_name;
