-- Schedule referral program HTTP crons via Supabase pg_cron (production scheduler).
-- Times are UTC: 06:00 = 08:00 SAST, 06:30 = 08:30 SAST, 07:00 on 1st = 09:00 SAST.
-- Requires invoke_nextjs_cron + cron_http_targets from 20261005_consolidate_all_http_crons_in_supabase.sql.

do $referral_crons$
declare
  r record;
  v_names text[] := array[
    'referral-credit-reminders',
    'referral-credit-expiry',
    'referral-campaigns'
  ];
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron not installed — skip referral cron scheduling';
    return;
  end if;

  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'invoke_nextjs_cron'
  ) then
    raise notice 'invoke_nextjs_cron missing — skip referral cron scheduling';
    return;
  end if;

  for r in select jobid from cron.job where jobname = any(v_names) loop
    perform cron.unschedule(r.jobid);
  end loop;

  -- Expiry reminders first (7-day window); expire past-due credit 30 minutes later.
  perform cron.schedule(
    'referral-credit-reminders',
    '0 6 * * *',
    $$select public.invoke_nextjs_cron('/api/cron/referral-credit-reminders');$$
  );
  perform cron.schedule(
    'referral-credit-expiry',
    '30 6 * * *',
    $$select public.invoke_nextjs_cron('/api/cron/referral-credit-expiry');$$
  );
  perform cron.schedule(
    'referral-campaigns',
    '0 7 1 * *',
    $$select public.invoke_nextjs_cron('/api/cron/referral-campaigns');$$
  );
end;
$referral_crons$;
