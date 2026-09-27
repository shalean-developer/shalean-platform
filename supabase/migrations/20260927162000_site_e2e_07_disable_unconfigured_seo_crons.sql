-- SITE-E2E-07
-- Disable SEO HTTP crons whose required external providers are not configured
-- in the current production runtime. Keeping them active produces daily error
-- runs and avoidable log/egress noise without delivering useful SEO data.
--
-- Re-enable deliberately after credentials/provider configuration is verified.

do $site_e2e_07$
declare
  r record;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron extension not available; skipping SITE-E2E-07 cron disable';
    return;
  end if;

  for r in
    select jobid, jobname
    from cron.job
    where jobname in ('gsc-sync', 'seo-indexing', 'seo-competitors')
      and active = true
  loop
    perform cron.alter_job(
      job_id := r.jobid,
      active := false
    );
    raise notice 'SITE-E2E-07 disabled cron job % (id=%)', r.jobname, r.jobid;
  end loop;
end $site_e2e_07$;
