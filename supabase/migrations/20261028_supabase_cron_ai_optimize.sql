-- Add ai-optimize to Supabase HTTP cron schedule (was dropped during consolidation).
-- All other jobs: migration 20261005 + scripts/print-setup-supabase-crons.sql.mjs

do $cron$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron not installed — skip ai-optimize schedule';
    return;
  end if;
  if not exists (select 1 from pg_proc where proname = 'invoke_nextjs_cron') then
    raise notice 'invoke_nextjs_cron missing — apply 20261005 first';
    return;
  end if;

  perform cron.unschedule(jobid)
  from cron.job
  where jobname in ('ai-optimize', 'shalean_ai_optimize');

  perform cron.schedule(
    'ai-optimize',
    '0 * * * *',
    $$select public.invoke_nextjs_cron('/api/cron/ai-optimize');$$
  );
end;
$cron$;
