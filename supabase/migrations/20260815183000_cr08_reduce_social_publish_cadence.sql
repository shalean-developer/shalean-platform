-- CR-08: reduce idle social publish polling while preserving scheduled publishing.
-- Production audit on 2026-08-15 found 0 social_publish_jobs created/processed in the prior 30 days.
-- Moving from every 5 minutes (~288/day) to every 15 minutes (~96/day) cuts scheduled HTTP calls ~67%.

select cron.unschedule(jobid)
from cron.job
where jobname = 'social-publish-jobs';

select cron.schedule(
  'social-publish-jobs',
  '*/15 * * * *',
  $$select public.invoke_nextjs_cron('/api/cron/process-social-publish-jobs');$$
);
