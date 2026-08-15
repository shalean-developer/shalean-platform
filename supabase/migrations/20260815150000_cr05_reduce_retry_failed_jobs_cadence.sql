-- CR-05: reduce idle retry-failed-jobs polling cost without materially slowing dispatch.
--
-- Baseline in production before this migration:
--   retry-failed-jobs = * * * * * (~1,440 scheduled invocations/day)
--
-- The route still contains dispatch retry processing, so this is deliberately a
-- conservative first reduction to every 2 minutes. Compared with the current
-- minute-level scheduler this adds at most about one additional minute of poll
-- latency while halving scheduled HTTP invocations.

-- Remove the existing canonical job if present. `cron.unschedule(jobid)` is safe
-- to call for each matching row and avoids a DO/dollar-quote block entirely.
select cron.unschedule(jobid)
from cron.job
where jobname = 'retry-failed-jobs';

-- Recreate the canonical job at the lower-cost cadence.
select cron.schedule(
  'retry-failed-jobs',
  '*/2 * * * *',
  $$select public.invoke_nextjs_cron('/api/cron/retry-failed-jobs');$$
);
