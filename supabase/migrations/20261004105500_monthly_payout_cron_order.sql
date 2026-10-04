-- PAYOUT-E2E-002: monthly cleaner payout closeout ordering.
-- Generate previous month first, then freeze it, then create the review/disbursement run.
-- This avoids newly generated batches missing the same Monday run and waiting another week.

do $$
declare
  r record;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron not installed — skip payout cron reschedule';
    return;
  end if;

  if not exists (select 1 from pg_proc where proname = 'invoke_nextjs_cron') then
    raise notice 'invoke_nextjs_cron missing — skip payout cron reschedule';
    return;
  end if;

  for r in
    select jobid
    from cron.job
    where jobname in ('generate-payouts', 'freeze-payouts', 'create-payout-run')
  loop
    perform cron.unschedule(r.jobid);
  end loop;

  perform cron.schedule(
    'generate-payouts',
    '0 6 * * 1',
    $job$select public.invoke_nextjs_cron('/api/cron/generate-payouts');$job$
  );

  perform cron.schedule(
    'freeze-payouts',
    '0 7 * * 1',
    $job$select public.invoke_nextjs_cron('/api/cron/freeze-payouts');$job$
  );

  perform cron.schedule(
    'create-payout-run',
    '0 8 * * 1',
    $job$select public.invoke_nextjs_cron('/api/cron/create-payout-run');$job$
  );
end
$$;
