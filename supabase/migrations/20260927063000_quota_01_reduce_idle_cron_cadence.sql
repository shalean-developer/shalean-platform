-- QUOTA-01: reduce Supabase egress/log-ingest from idle production polling.
-- Runtime change already verified on production before this migration file was recorded.
-- Keep dispatch-timeouts and whatsapp-worker at 2 minutes; only reduce jobs whose
-- health/functional contracts tolerate the added latency.

select cron.alter_job(jobid, schedule := '*/10 * * * *')
from cron.job
where jobname = 'retry-failed-jobs';

select cron.alter_job(jobid, schedule := '*/20 * * * *')
from cron.job
where jobname = 'generate-recurring-bookings';

select cron.alter_job(jobid, schedule := '*/30 * * * *')
from cron.job
where jobname = 'ops-health';
