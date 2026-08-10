-- SEO-018: daily Search Console URL Inspection sync after other SEO refreshes.
select cron.unschedule(jobid)
from cron.job
where jobname = 'seo-indexing';

select cron.schedule(
  'seo-indexing',
  '15 7 * * *',
  $$select public.invoke_nextjs_cron('/api/cron/seo-indexing');$$
);
