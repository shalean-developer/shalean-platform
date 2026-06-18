/**
 * Prints SQL that clones the WORKING charge-recurring-bookings pg_cron command
 * and swaps the URL to generate-recurring-bookings (same secret/headers).
 *
 * Run in Supabase SQL Editor when generate job exists but cron_runs never updates.
 *
 *   node scripts/print-clone-generate-from-charge-pg-cron.sql.mjs
 */
console.log(`-- Clone generate job from working charge job (same auth headers + domain)
-- Step 1 — compare commands (optional):
--   select jobname, left(command, 200) as command_preview from cron.job
--   where jobname in ('charge-recurring-bookings', 'generate-recurring-bookings');

-- Step 2 — replace generate with a copy of charge (URL path swapped only):
do $$
declare
  charge_command text;
  generate_command text;
  r record;
begin
  select command into charge_command
  from cron.job
  where jobname = 'charge-recurring-bookings'
  limit 1;

  if charge_command is null then
    raise exception 'charge-recurring-bookings job not found';
  end if;

  generate_command := replace(
    charge_command,
    'charge-recurring-bookings',
    'generate-recurring-bookings'
  );

  if generate_command = charge_command then
    raise exception 'Could not swap URL in charge command — inspect cron.job.command manually';
  end if;

  for r in
    select jobid from cron.job where jobname = 'generate-recurring-bookings'
  loop
    perform cron.unschedule(r.jobid);
  end loop;

  perform cron.schedule(
    'generate-recurring-bookings',
    '*/10 * * * *',
    generate_command
  );
end
$$;

-- Step 3 — manual pg_net smoke test (should return a request id):
-- select net.http_post(
--   url := 'https://shalean.co.za/api/cron/generate-recurring-bookings',
--   headers := (
--     select (regexp_matches(command, 'headers := (jsonb_build_object\\(.+\\))', 'n'))[1]::jsonb
--     from cron.job where jobname = 'charge-recurring-bookings' limit 1
--   ),
--   body := '{}'::jsonb
-- );
-- Then: select id, status_code, timed_out, error_msg, created from net._http_response order by created desc limit 3;

-- Step 4 — after ~10 minutes:
-- select job_name, status, created_at, left(message, 100)
-- from public.cron_runs
-- where job_name = 'generate-recurring-bookings'
-- order by created_at desc limit 5;
`);
