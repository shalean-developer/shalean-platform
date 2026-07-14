-- ============================================================================
-- Edge Function cron invoker (parallel to invoke_nextjs_cron).
-- Apply AFTER deploying supabase/functions/whatsapp-worker (and setting secrets).
--
-- BEFORE CUT OVER:
--   update public.cron_http_targets
--   set edge_base_url = 'https://<project-ref>.supabase.co/functions/v1',
--       cron_secret = '<same as Vercel CRON_SECRET>',
--       updated_at = now()
--   where singleton;
--
-- SHADOW MODE: do NOT reschedule pg_cron until Edge is verified manually.
-- Rollback: reschedule job back to invoke_nextjs_cron('/api/cron/...').
-- ============================================================================

alter table public.cron_http_targets
  add column if not exists edge_base_url text;

comment on column public.cron_http_targets.edge_base_url is
  'Base URL for Supabase Edge Functions, e.g. https://<ref>.supabase.co/functions/v1';

create or replace function public.invoke_edge_cron(function_name text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cfg record;
  v_url text;
  v_name text;
  v_req_id bigint;
begin
  if function_name is null or btrim(function_name) = '' then
    raise exception 'function_name is required';
  end if;

  v_name := btrim(function_name);
  if v_name like '/%' then
    v_name := ltrim(v_name, '/');
  end if;

  select app_base_url, cron_secret, edge_base_url
  into v_cfg
  from public.cron_http_targets
  where singleton
  limit 1;

  if v_cfg is null then
    raise exception 'cron_http_targets row missing';
  end if;

  if v_cfg.edge_base_url is null or btrim(v_cfg.edge_base_url) = '' then
    raise exception 'cron_http_targets.edge_base_url not set — configure before invoke_edge_cron';
  end if;

  if v_cfg.cron_secret = 'YOUR_CRON_SECRET' or v_cfg.cron_secret is null or btrim(v_cfg.cron_secret) = '' then
    raise exception 'cron_http_targets.cron_secret not configured';
  end if;

  v_url := rtrim(v_cfg.edge_base_url, '/') || '/' || v_name;

  select net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_cfg.cron_secret,
      'x-cron-secret', v_cfg.cron_secret
    ),
    body := '{}'::jsonb
  )
  into v_req_id;

  return v_req_id;
end;
$$;

comment on function public.invoke_edge_cron(text) is
  'pg_net POST to Supabase Edge Function using cron_http_targets.edge_base_url + CRON_SECRET.';

revoke all on function public.invoke_edge_cron(text) from public;
grant execute on function public.invoke_edge_cron(text) to service_role;

-- Example cutover (DO NOT RUN until shadow verification complete):
-- select cron.unschedule('whatsapp-worker');
-- select cron.schedule(
--   'whatsapp-worker',
--   '* * * * *',
--   $$select public.invoke_edge_cron('whatsapp-worker');$$
-- );
