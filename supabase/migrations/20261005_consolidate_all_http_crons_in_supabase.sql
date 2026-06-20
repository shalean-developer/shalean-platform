-- ============================================================================
-- Consolidate all Next.js HTTP crons under Supabase pg_cron + pg_net.
-- Removes reliance on Vercel `vercel.json` crons (cleared in the same release).
--
-- BEFORE PRODUCTION USE:
--   update public.cron_http_targets
--   set app_base_url = 'https://shalean.co.za',
--       cron_secret = '<same value as Vercel env CRON_SECRET>',
--       updated_at = now()
--   where singleton;
--
-- Auth: matches `verifyCronSecret` — Bearer + x-cron-secret (see invoke_nextjs_cron).
-- ============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ---------------------------------------------------------------------------
-- Singleton config — set app_base_url + cron_secret once in SQL Editor.
-- ---------------------------------------------------------------------------
create table if not exists public.cron_http_targets (
  singleton boolean primary key default true check (singleton),
  app_base_url text not null default 'https://YOUR_DOMAIN',
  cron_secret text not null default 'YOUR_CRON_SECRET',
  updated_at timestamptz not null default now()
);

comment on table public.cron_http_targets is
  'Production origin + CRON_SECRET for pg_net → Next.js /api/cron/* (service_role only).';

alter table public.cron_http_targets enable row level security;
revoke all on public.cron_http_targets from public;
grant select, update on public.cron_http_targets to service_role;

insert into public.cron_http_targets (singleton, app_base_url, cron_secret)
values (true, 'https://YOUR_DOMAIN', 'YOUR_CRON_SECRET')
on conflict (singleton) do nothing;

-- ---------------------------------------------------------------------------
-- Shared HTTP trigger for all Next.js cron routes.
-- ---------------------------------------------------------------------------
create or replace function public.invoke_nextjs_cron(cron_path text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cfg record;
  v_url text;
  v_path text;
  v_req_id bigint;
begin
  if cron_path is null or btrim(cron_path) = '' then
    raise exception 'cron_path is required';
  end if;

  v_path := cron_path;
  if left(v_path, 1) <> '/' then
    v_path := '/' || v_path;
  end if;

  select app_base_url, cron_secret
  into v_cfg
  from public.cron_http_targets
  where singleton
  limit 1;

  if v_cfg is null then
    raise exception 'cron_http_targets row missing';
  end if;

  if v_cfg.app_base_url like '%YOUR_DOMAIN%' or v_cfg.cron_secret = 'YOUR_CRON_SECRET' then
    raise exception 'cron_http_targets still has placeholder values — update app_base_url and cron_secret';
  end if;

  v_url := rtrim(v_cfg.app_base_url, '/') || v_path;

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

comment on function public.invoke_nextjs_cron(text) is
  'pg_net POST to Next.js /api/cron/* using cron_http_targets (Bearer + x-cron-secret).';

revoke all on function public.invoke_nextjs_cron(text) from public;
grant execute on function public.invoke_nextjs_cron(text) to service_role;

-- ---------------------------------------------------------------------------
-- Reschedule: drop legacy names, then register canonical pg_cron jobs.
-- ---------------------------------------------------------------------------
do $cron$
declare
  r record;
  v_legacy text[] := array[
    'booking-lifecycle-job',
    'shalean_booking_lifecycle',
    'retry-unassigned',
    'shalean_ai_optimize',
    'shalean_subscription_bookings',
    'dispatch-timeouts-job',
    'shalean_dispatch_timeouts',
    'shalean_retry_failed_jobs_minutely',
    'shalean_retry_failed_jobs',
    'ai-optimize',
    'dispatch-cycle'
  ];
  v_canonical text[] := array[
    'generate-recurring-bookings',
    'charge-recurring-bookings',
    'dispatch-timeouts',
    'retry-failed-jobs',
    'booking-lifecycle',
    'payment-recovery',
    'prune-admin-idempotency',
    'send-invoice-reminders',
    'payout-integrity-daily',
    'extend-cleaner-availability',
    'cleaner-earnings-auto-payout',
    'charge-monthly-invoices',
    'seo-optimization',
    'gsc-sync',
    'assignment-ack-timeout',
    'notification-health',
    'booking-reminders',
    'payment-link-reminders',
    'deferred-payment-link-emails',
    'expire-pending-payments',
    'whatsapp-worker',
    'ops-health',
    'customer-retention',
    'recurring-precharge-reminders',
    'mark-monthly-invoices-overdue',
    'repair-monthly-payment-state-drift',
    'generate-payouts',
    'create-payout-run',
    'freeze-payouts',
    'reconcile-paystack-transfers',
    'prune-system-logs'
  ];
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron not installed — skip HTTP cron scheduling';
    return;
  end if;

  for r in
    select jobid, jobname
    from cron.job
    where jobname = any(v_legacy || v_canonical)
  loop
    perform cron.unschedule(r.jobid);
  end loop;

  -- Recurring bookings (every 10 minutes)
  perform cron.schedule(
    'generate-recurring-bookings',
    '*/10 * * * *',
    $$select public.invoke_nextjs_cron('/api/cron/generate-recurring-bookings');$$
  );
  perform cron.schedule(
    'charge-recurring-bookings',
    '*/10 * * * *',
    $$select public.invoke_nextjs_cron('/api/cron/charge-recurring-bookings');$$
  );

  -- Dispatch + retries (every minute — critical path)
  perform cron.schedule(
    'dispatch-timeouts',
    '* * * * *',
    $$select public.invoke_nextjs_cron('/api/cron/dispatch-timeouts');$$
  );
  perform cron.schedule(
    'retry-failed-jobs',
    '* * * * *',
    $$select public.invoke_nextjs_cron('/api/cron/retry-failed-jobs');$$
  );

  -- Lifecycle + payment recovery (every 15 minutes — former Vercel cadence)
  perform cron.schedule(
    'booking-lifecycle',
    '*/15 * * * *',
    $$select public.invoke_nextjs_cron('/api/cron/booking-lifecycle');$$
  );
  perform cron.schedule(
    'payment-recovery',
    '*/15 * * * *',
    $$select public.invoke_nextjs_cron('/api/cron/payment-recovery');$$
  );

  -- Former Vercel daily / weekly jobs
  perform cron.schedule(
    'prune-admin-idempotency',
    '0 3 * * *',
    $$select public.invoke_nextjs_cron('/api/cron/prune-admin-idempotency');$$
  );
  perform cron.schedule(
    'send-invoice-reminders',
    '0 9 * * *',
    $$select public.invoke_nextjs_cron('/api/cron/send-invoice-reminders');$$
  );
  perform cron.schedule(
    'payout-integrity-daily',
    '15 4 * * *',
    $$select public.invoke_nextjs_cron('/api/cron/payout-integrity-daily');$$
  );
  perform cron.schedule(
    'extend-cleaner-availability',
    '30 2 * * *',
    $$select public.invoke_nextjs_cron('/api/cron/extend-cleaner-availability');$$
  );
  perform cron.schedule(
    'cleaner-earnings-auto-payout',
    '45 5 * * *',
    $$select public.invoke_nextjs_cron('/api/cron/cleaner-earnings-auto-payout');$$
  );
  perform cron.schedule(
    'charge-monthly-invoices',
    '55 21 * * *',
    $$select public.invoke_nextjs_cron('/api/cron/charge-monthly-invoices');$$
  );
  perform cron.schedule(
    'seo-optimization',
    '20 6 * * 1',
    $$select public.invoke_nextjs_cron('/api/cron/seo-optimization');$$
  );
  perform cron.schedule(
    'gsc-sync',
    '15 5 * * *',
    $$select public.invoke_nextjs_cron('/api/cron/gsc-sync');$$
  );

  -- Other production HTTP crons (not on Vercel Hobby list but required in prod)
  perform cron.schedule(
    'assignment-ack-timeout',
    '*/5 * * * *',
    $$select public.invoke_nextjs_cron('/api/cron/assignment-ack-timeout');$$
  );
  perform cron.schedule(
    'notification-health',
    '*/10 * * * *',
    $$select public.invoke_nextjs_cron('/api/cron/notification-health');$$
  );
  perform cron.schedule(
    'booking-reminders',
    '*/15 * * * *',
    $$select public.invoke_nextjs_cron('/api/cron/booking-reminders');$$
  );
  perform cron.schedule(
    'payment-link-reminders',
    '*/15 * * * *',
    $$select public.invoke_nextjs_cron('/api/cron/payment-link-reminders');$$
  );
  perform cron.schedule(
    'deferred-payment-link-emails',
    '*/5 * * * *',
    $$select public.invoke_nextjs_cron('/api/cron/deferred-payment-link-emails');$$
  );
  perform cron.schedule(
    'expire-pending-payments',
    '0 * * * *',
    $$select public.invoke_nextjs_cron('/api/cron/expire-pending-payments');$$
  );
  perform cron.schedule(
    'whatsapp-worker',
    '* * * * *',
    $$select public.invoke_nextjs_cron('/api/cron/whatsapp-worker');$$
  );
  perform cron.schedule(
    'ops-health',
    '*/15 * * * *',
    $$select public.invoke_nextjs_cron('/api/cron/ops-health');$$
  );
  perform cron.schedule(
    'customer-retention',
    '30 7 * * *',
    $$select public.invoke_nextjs_cron('/api/cron/customer-retention');$$
  );
  perform cron.schedule(
    'recurring-precharge-reminders',
    '0 8 * * *',
    $$select public.invoke_nextjs_cron('/api/cron/recurring-precharge-reminders');$$
  );
  perform cron.schedule(
    'mark-monthly-invoices-overdue',
    '0 10 * * *',
    $$select public.invoke_nextjs_cron('/api/cron/mark-monthly-invoices-overdue');$$
  );
  perform cron.schedule(
    'repair-monthly-payment-state-drift',
    '30 4 * * *',
    $$select public.invoke_nextjs_cron('/api/cron/repair-monthly-payment-state-drift');$$
  );
  perform cron.schedule(
    'generate-payouts',
    '0 6 * * 1',
    $$select public.invoke_nextjs_cron('/api/cron/generate-payouts');$$
  );
  perform cron.schedule(
    'create-payout-run',
    '0 7 * * 1',
    $$select public.invoke_nextjs_cron('/api/cron/create-payout-run');$$
  );
  perform cron.schedule(
    'freeze-payouts',
    '0 8 * * 1',
    $$select public.invoke_nextjs_cron('/api/cron/freeze-payouts');$$
  );
  perform cron.schedule(
    'reconcile-paystack-transfers',
    '*/30 * * * *',
    $$select public.invoke_nextjs_cron('/api/cron/reconcile-paystack-transfers');$$
  );
  perform cron.schedule(
    'prune-system-logs',
    '0 4 * * 0',
    $$select public.invoke_nextjs_cron('/api/cron/prune-system-logs');$$
  );
end;
$cron$;

-- analytics-warehouse: SQL-only (no HTTP duplicate). Align nightly time with former Vercel cron.
do $analytics$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    return;
  end if;
  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'run_analytics_warehouse_nightly'
  ) then
    raise notice 'run_analytics_warehouse_nightly missing — skip analytics cron reschedule';
    return;
  end if;

  perform cron.unschedule(jobid)
  from cron.job
  where jobname = 'analytics-warehouse-nightly';

  perform cron.schedule(
    'analytics-warehouse-nightly',
    '30 2 * * *',
    $$select public.run_analytics_warehouse_nightly();$$
  );
end;
$analytics$;
