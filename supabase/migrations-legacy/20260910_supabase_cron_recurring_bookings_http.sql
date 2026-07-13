-- ============================================================================
-- pg_cron + pg_net: recurring bookings engine → Next.js (every 10 minutes)
-- ============================================================================
-- Triggers:
--   - POST /api/cron/generate-recurring-bookings
--   - POST /api/cron/charge-recurring-bookings
--
-- BEFORE APPLY:
--   1) Replace YOUR_DOMAIN with production origin, e.g. https://shalean.co.za (no trailing slash).
--   2) Replace every YOUR_CRON_SECRET below with the same value as Next.js env CRON_SECRET.
--
-- Why headers are inlined (not ALTER DATABASE ... SET app.cron_secret):
--   Supabase migration / dashboard roles typically lack privilege to set custom database
--   parameters (ERROR 42501 permission denied). Same pattern as
--   `20260655_supabase_cron_dispatch_http_minute.sql`.
--
-- Auth: matches `verifyCronSecret` — Bearer + x-cron-secret.
--
-- Verify:
--   SELECT jobid, jobname, schedule FROM cron.job
--     WHERE jobname IN ('generate-recurring-bookings','charge-recurring-bookings');
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
      'generate-recurring-bookings',
      'charge-recurring-bookings'
    )
  loop
    perform cron.unschedule(r.jobid);
  end loop;
end
$$;

-- Every 10 minutes: spawn visits from active recurring_bookings (Africa/Johannesburg)
select cron.schedule(
  'generate-recurring-bookings',
  '*/10 * * * *',
  $$
  select net.http_post(
    url := 'https://YOUR_DOMAIN/api/cron/generate-recurring-bookings',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer YOUR_CRON_SECRET',
      'x-cron-secret', 'YOUR_CRON_SECRET'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Every 10 minutes: Paystack charge_authorization + retries for pending_payment recurring rows
select cron.schedule(
  'charge-recurring-bookings',
  '*/10 * * * *',
  $$
  select net.http_post(
    url := 'https://YOUR_DOMAIN/api/cron/charge-recurring-bookings',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer YOUR_CRON_SECRET',
      'x-cron-secret', 'YOUR_CRON_SECRET'
    ),
    body := '{}'::jsonb
  );
  $$
);
