select cron.unschedule(jobid) from cron.job where jobname = 'robots-health';

select cron.schedule(
  'robots-health',
  '15 */6 * * *',
  $$select public.invoke_nextjs_cron('/api/cron/robots-health');$$
);
