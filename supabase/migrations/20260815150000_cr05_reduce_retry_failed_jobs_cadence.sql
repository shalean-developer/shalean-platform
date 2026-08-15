-- CR-05: reduce idle retry-failed-jobs polling cost without materially slowing dispatch.
--
-- Baseline in production before this migration:
--   retry-failed-jobs = * * * * * (~1,440 scheduled invocations/day)
--
-- The route still contains dispatch retry processing, so this is deliberately a
-- conservative first reduction to every 2 minutes. Compared with the current
-- minute-level scheduler this adds at most about one additional minute of poll
-- latency while halving scheduled HTTP invocations.

do $cron$
declare
  r record;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron not installed — skip retry-failed-jobs reschedule';
    return;
  end if;

  for r in
    select jobid
    from cron.job
    where jobname = 'retry-failed-jobs'
  loop
    perform cron.unschedule(r.jobid);
  end loop;

  perform cron.schedule(
    'retry-failed-jobs',
    '*/2 * * * *',
    $$select public.invoke_nextjs_cron('/api/cron/retry-failed-jobs');$$
  );
end;
$cron$;
