-- Speed up SEO Command Centre automation-history reads on the high-volume system_logs table.
-- The dashboard filters source='cron_run', narrows by job message, then orders newest first.
create index if not exists system_logs_cron_run_message_created_idx
  on public.system_logs (message, created_at desc)
  where source = 'cron_run';
