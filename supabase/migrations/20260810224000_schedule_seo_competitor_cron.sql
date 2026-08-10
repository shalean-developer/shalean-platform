do $schedule$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then return; end if;
  if not exists (select 1 from pg_proc where proname = 'invoke_nextjs_cron') then return; end if;

  perform cron.unschedule(jobid) from cron.job where jobname = 'seo-competitors';
  perform cron.schedule(
    'seo-competitors',
    '45 6 * * *',
    $$select public.invoke_nextjs_cron('/api/cron/seo-competitors');$$
  );
end;
$schedule$;
