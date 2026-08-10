-- SEO-017: schedule the canonical competitor SERP sync through Supabase pg_cron.
-- The prerequisite scheduler migration guarantees pg_cron and invoke_nextjs_cron exist.

select cron.unschedule(jobid)
from cron.job
where jobname = 'seo-competitors';

select cron.schedule(
  'seo-competitors',
  '45 6 * * *',
  $$select public.invoke_nextjs_cron('/api/cron/seo-competitors');$$
);
