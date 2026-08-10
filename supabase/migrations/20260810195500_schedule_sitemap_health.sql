do $schedule$
declare
  existing_job_id bigint;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise exception 'pg_cron extension is required for sitemap-health';
  end if;
  if not exists (select 1 from pg_proc where proname = 'invoke_nextjs_cron') then
    raise exception 'invoke_nextjs_cron is required for sitemap-health';
  end if;

  select jobid into existing_job_id from cron.job where jobname = 'sitemap-health' limit 1;
  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;

  perform cron.schedule(
    'sitemap-health',
    '0 */6 * * *',
    $$select public.invoke_nextjs_cron('/api/cron/sitemap-health');$$
  );
end;
$schedule$;
