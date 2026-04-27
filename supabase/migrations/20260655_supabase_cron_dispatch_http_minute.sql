-- ============================================================================
-- pg_cron + pg_net: minute HTTP → Next.js dispatch crons (Vercel Hobby-safe)
-- ============================================================================
-- Replaces Vercel `vercel.json` crons for:
--   - /api/cron/dispatch-timeouts
--   - /api/cron/retry-failed-jobs
--
-- BEFORE APPLY (SQL Editor or CI substitute):
--   1) Replace YOUR_DOMAIN with production host, e.g. https://www.shalean.com (no trailing slash).
--   2) Replace YOUR_CRON_SECRET with the same value as Vercel/Next.js env CRON_SECRET.
--
-- Headers: `x-cron-secret` (required by app); optional duplicate `Authorization: Bearer` if desired.
--
-- Idempotency: unschedules prior jobs with these names, including legacy `retry-unassigned` which
-- previously POSTed the same retry-failed-jobs URL on a slower cadence (avoids double-firing).
-- ============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
declare
  r record;
begin
  for r in
    select jobid, jobname
    from cron.job
    where jobname in (
      'dispatch-timeouts-job',
      'retry-failed-jobs',
      'shalean_dispatch_timeouts',
      'shalean_retry_failed_jobs_minutely',
      'retry-unassigned'
    )
  loop
    perform cron.unschedule(r.jobid);
  end loop;
end
$$;

-- Every minute: expire pending dispatch_offers + queue reassignment (Next.js)
select cron.schedule(
  'dispatch-timeouts-job',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://YOUR_DOMAIN/api/cron/dispatch-timeouts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', 'YOUR_CRON_SECRET'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Every minute: failed_jobs, lifecycle retries, dispatch_retry_queue, SLA hooks (Next.js)
select cron.schedule(
  'retry-failed-jobs',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://YOUR_DOMAIN/api/cron/retry-failed-jobs',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', 'YOUR_CRON_SECRET'
    ),
    body := '{}'::jsonb
  );
  $$
);
