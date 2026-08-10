-- SEO-009: schedule production sitemap monitoring on the canonical Supabase scheduler.
-- Idempotent: replace any existing sitemap-health job before registering the new cadence.

select cron.unschedule(jobid)
from cron.job
where jobname = 'sitemap-health';

select cron.schedule(
  'sitemap-health',
  '0 */6 * * *',
  $job$select public.invoke_nextjs_cron('/api/cron/sitemap-health');$job$
);
