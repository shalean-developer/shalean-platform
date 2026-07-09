/**
 * Print SQL to move all HTTP crons to Supabase pg_cron + pg_net.
 *
 * Usage (from apps/web):
 *   node scripts/print-setup-supabase-crons.sql.mjs
 *
 * Paste output into Supabase Dashboard → SQL Editor → Run.
 * Then remove any Cron Jobs in Vercel (shalean-platform → Settings → Cron Jobs).
 */
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dir = dirname(fileURLToPath(import.meta.url));
for (const line of readFileSync(resolve(__dir, "../.env.local"), "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const eq = t.indexOf("=");
  if (eq <= 0) continue;
  if (!process.env[t.slice(0, eq).trim()]) {
    process.env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
  }
}

const secret = process.env.CRON_SECRET?.trim();
if (!secret) {
  console.error("CRON_SECRET missing from .env.local");
  process.exit(1);
}

const rawUrl = (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || "https://shalean.co.za").trim();
const host = rawUrl.includes("localhost") ? "https://shalean.co.za" : rawUrl.replace(/\/$/, "");
const sqlSecret = secret.replace(/'/g, "''");
const sqlHost = host.replace(/'/g, "''");

/** [jobname, cron expression, path] */
const HTTP_JOBS = [
  ["generate-recurring-bookings", "*/10 * * * *", "/api/cron/generate-recurring-bookings"],
  ["charge-recurring-bookings", "*/10 * * * *", "/api/cron/charge-recurring-bookings"],
  ["dispatch-timeouts", "* * * * *", "/api/cron/dispatch-timeouts"],
  ["retry-failed-jobs", "* * * * *", "/api/cron/retry-failed-jobs"],
  ["whatsapp-worker", "* * * * *", "/api/cron/whatsapp-worker"],
  ["booking-lifecycle", "*/15 * * * *", "/api/cron/booking-lifecycle"],
  ["payment-recovery", "*/15 * * * *", "/api/cron/payment-recovery"],
  ["assignment-ack-timeout", "*/5 * * * *", "/api/cron/assignment-ack-timeout"],
  ["notification-health", "*/10 * * * *", "/api/cron/notification-health"],
  ["booking-reminders", "*/15 * * * *", "/api/cron/booking-reminders"],
  ["payment-link-reminders", "*/15 * * * *", "/api/cron/payment-link-reminders"],
  ["deferred-payment-link-emails", "*/5 * * * *", "/api/cron/deferred-payment-link-emails"],
  ["ops-health", "*/15 * * * *", "/api/cron/ops-health"],
  ["reconcile-paystack-transfers", "*/30 * * * *", "/api/cron/reconcile-paystack-transfers"],
  ["expire-pending-payments", "0 * * * *", "/api/cron/expire-pending-payments"],
  ["ai-optimize", "0 * * * *", "/api/cron/ai-optimize"],
  ["prune-admin-idempotency", "0 3 * * *", "/api/cron/prune-admin-idempotency"],
  ["send-invoice-reminders", "0 9 * * *", "/api/cron/send-invoice-reminders"],
  ["mark-monthly-invoices-overdue", "0 10 * * *", "/api/cron/mark-monthly-invoices-overdue"],
  ["recurring-precharge-reminders", "0 8 * * *", "/api/cron/recurring-precharge-reminders"],
  ["referral-credit-reminders", "0 6 * * *", "/api/cron/referral-credit-reminders"],
  ["referral-credit-expiry", "30 6 * * *", "/api/cron/referral-credit-expiry"],
  ["referral-campaigns", "0 7 1 * *", "/api/cron/referral-campaigns"],
  ["payout-integrity-daily", "15 4 * * *", "/api/cron/payout-integrity-daily"],
  ["repair-monthly-payment-state-drift", "30 4 * * *", "/api/cron/repair-monthly-payment-state-drift"],
  ["gsc-sync", "15 5 * * *", "/api/cron/gsc-sync"],
  ["customer-retention", "30 7 * * *", "/api/cron/customer-retention"],
  ["extend-cleaner-availability", "30 2 * * *", "/api/cron/extend-cleaner-availability"],
  ["cleaner-earnings-auto-payout", "45 5 * * *", "/api/cron/cleaner-earnings-auto-payout"],
  ["charge-monthly-invoices", "55 21 * * *", "/api/cron/charge-monthly-invoices"],
  ["seo-optimization", "20 6 * * 1", "/api/cron/seo-optimization"],
  ["generate-payouts", "0 6 * * 1", "/api/cron/generate-payouts"],
  ["create-payout-run", "0 7 * * 1", "/api/cron/create-payout-run"],
  ["freeze-payouts", "0 8 * * 1", "/api/cron/freeze-payouts"],
  ["prune-system-logs", "0 4 * * 0", "/api/cron/prune-system-logs"],
];

const LEGACY_NAMES = [
  "booking-lifecycle-job",
  "shalean_booking_lifecycle",
  "retry-unassigned",
  "shalean_ai_optimize",
  "shalean_subscription_bookings",
  "dispatch-timeouts-job",
  "shalean_dispatch_timeouts",
  "shalean_retry_failed_jobs_minutely",
  "shalean_retry_failed_jobs",
  "dispatch-cycle",
  "subscription-bookings",
];

console.log(`-- Supabase pg_cron setup for ${host}
-- Requires migration 20261005_consolidate_all_http_crons_in_supabase.sql (invoke_nextjs_cron + cron_http_targets).
-- After run: delete all Cron Jobs in Vercel → shalean-platform → Settings → Cron Jobs.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 1) Point schedulers at production Next.js + shared secret
insert into public.cron_http_targets (singleton, app_base_url, cron_secret)
values (true, '${sqlHost}', '${sqlSecret}')
on conflict (singleton) do update
set app_base_url = excluded.app_base_url,
    cron_secret = excluded.cron_secret,
    updated_at = now();

-- 2) Drop legacy + canonical job names (idempotent reschedule)
do $drop$
declare r record;
  v_names text[] := array[
${[...LEGACY_NAMES, ...HTTP_JOBS.map((j) => j[0])].map((n) => `    '${n}'`).join(",\n")}
  ];
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise exception 'pg_cron extension not available on this Supabase project';
  end if;
  for r in select jobid from cron.job where jobname = any(v_names) loop
    perform cron.unschedule(r.jobid);
  end loop;
end;
$drop$;

-- 3) Register HTTP crons via invoke_nextjs_cron (reads cron_http_targets)
do $schedule$
begin
  if not exists (select 1 from pg_proc where proname = 'invoke_nextjs_cron') then
    raise exception 'invoke_nextjs_cron missing — apply migration 20261005 first';
  end if;
`);

for (const [name, sched, path] of HTTP_JOBS) {
  const escapedPath = path.replace(/'/g, "''");
  console.log(`  perform cron.schedule(
    '${name}',
    '${sched}',
    $$select public.invoke_nextjs_cron('${escapedPath}');$$
  );`);
}

console.log(`end;
$schedule$;

-- 4) SQL-only analytics (no HTTP)
do $analytics$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then return; end if;
  if not exists (select 1 from pg_proc where proname = 'run_analytics_warehouse_nightly') then return; end if;
  perform cron.unschedule(jobid) from cron.job where jobname = 'analytics-warehouse-nightly';
  perform cron.schedule(
    'analytics-warehouse-nightly',
    '30 2 * * *',
    $$select public.run_analytics_warehouse_nightly();$$
  );
end;
$analytics$;

-- Verify
select jobname, schedule, active from cron.job order by jobname;
select app_base_url, left(cron_secret, 8) || '…' as secret_prefix, updated_at from public.cron_http_targets where singleton;
`);
