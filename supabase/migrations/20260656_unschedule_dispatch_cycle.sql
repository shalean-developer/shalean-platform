-- Stranded + offer expiry for retry queue now run from Next.js `/api/cron/dispatch-timeouts` (minute HTTP).
-- Drop legacy pg_cron `dispatch-cycle` that called `public.run_dispatch_cycle()` every 5 minutes to avoid
-- duplicate work vs `dispatch-timeouts-job`.

do $$
declare
  r record;
begin
  for r in
    select jobid, jobname
    from cron.job
    where jobname = 'dispatch-cycle'
  loop
    perform cron.unschedule(r.jobid);
  end loop;
end
$$;
