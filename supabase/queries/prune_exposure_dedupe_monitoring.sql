-- Prune job: recent runs (matches `counters.ts` "Prune job monitoring" section).
-- Each successful prune inserts `system_logs` with source `prune_dispatch_offer_exposure_dedupe`.

select
  created_at,
  (context->>'deleted')::int as deleted,
  (context->>'retention_days')::int as retention_days,
  message
from public.system_logs
where source = 'prune_dispatch_offer_exposure_dedupe'
order by created_at desc
limit 100;

-- Monthly rollup: total rows removed + run count (ingestion / cron health).

select
  date_trunc('month', created_at) as run_month,
  sum((context->>'deleted')::bigint) as total_deleted,
  count(*) as prune_runs
from public.system_logs
where source = 'prune_dispatch_offer_exposure_dedupe'
group by 1
order by 1 desc;
