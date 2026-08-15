-- CR-06: reduce idle high-frequency HTTP polling while preserving operational responsiveness.
--
-- Production baseline before this migration:
--   dispatch-timeouts = * * * * * (~1,440 scheduled invocations/day)
--   whatsapp-worker   = * * * * * (~1,440 scheduled invocations/day)
--
-- Both move conservatively to every 2 minutes. This halves scheduled HTTP calls
-- while adding at most roughly one minute of scheduler latency versus the current
-- minute-level polling cadence.

select cron.unschedule(jobid)
from cron.job
where jobname in ('dispatch-timeouts', 'whatsapp-worker');

select cron.schedule(
  'dispatch-timeouts',
  '*/2 * * * *',
  $$select public.invoke_nextjs_cron('/api/cron/dispatch-timeouts');$$
);

select cron.schedule(
  'whatsapp-worker',
  '*/2 * * * *',
  $$select public.invoke_nextjs_cron('/api/cron/whatsapp-worker');$$
);
