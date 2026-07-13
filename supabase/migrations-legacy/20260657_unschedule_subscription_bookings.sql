-- Phase 2A: legacy subscriptions HTTP cron retired (route returns 410). Stop daily pg_net pings.

do $$
declare
  r record;
begin
  for r in
    select jobid, jobname
    from cron.job
    where jobname = 'shalean_subscription_bookings'
  loop
    perform cron.unschedule(r.jobid);
  end loop;
end
$$;
