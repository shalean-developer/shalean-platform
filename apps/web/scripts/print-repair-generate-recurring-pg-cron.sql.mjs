/**
 * Prints Supabase SQL to repair recurring pg_cron jobs (generator + charger).
 *
 * Usage (from apps/web):
 *   node scripts/print-repair-generate-recurring-pg-cron.sql.mjs
 *
 * Paste output into Supabase Dashboard → SQL Editor → Run.
 * Requires migration 20261005 (invoke_nextjs_cron + cron_http_targets).
 *
 * Uses CRON_SECRET from apps/web/.env.local — must match Vercel Production.
 */
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dir = dirname(fileURLToPath(import.meta.url));
const raw = readFileSync(resolve(__dir, "../.env.local"), "utf8");
for (const line of raw.split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const eq = t.indexOf("=");
  if (eq <= 0) continue;
  process.env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
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

const RECURRING_JOBS = [
  ["generate-recurring-bookings", "*/10 * * * *", "/api/cron/generate-recurring-bookings"],
  ["charge-recurring-bookings", "*/10 * * * *", "/api/cron/charge-recurring-bookings"],
];

console.log(`-- Repair recurring pg_cron jobs (generator + charger)
-- Host: ${host}
-- Sync cron_http_targets, then reschedule via invoke_nextjs_cron.
--
-- Verify after ~10 minutes:
--   select job_name, status, created_at, left(message, 80)
--   from public.cron_runs
--   where job_name in ('generate-recurring-bookings', 'charge-recurring-bookings')
--   order by created_at desc limit 10;
--
--   select jobname, schedule, active from cron.job
--   where jobname in ('generate-recurring-bookings', 'charge-recurring-bookings');

create extension if not exists pg_cron;
create extension if not exists pg_net;

insert into public.cron_http_targets (singleton, app_base_url, cron_secret)
values (true, '${sqlHost}', '${sqlSecret}')
on conflict (singleton) do update
set app_base_url = excluded.app_base_url,
    cron_secret = excluded.cron_secret,
    updated_at = now();

do $repair$
declare
  r record;
  v_names text[] := array['generate-recurring-bookings', 'charge-recurring-bookings'];
begin
  if not exists (select 1 from pg_proc where proname = 'invoke_nextjs_cron') then
    raise exception 'invoke_nextjs_cron missing — apply migration 20261005_consolidate_all_http_crons_in_supabase.sql first';
  end if;

  for r in select jobid from cron.job where jobname = any(v_names) loop
    perform cron.unschedule(r.jobid);
  end loop;
`);

for (const [name, sched, path] of RECURRING_JOBS) {
  const escapedPath = path.replace(/'/g, "''");
  console.log(`  perform cron.schedule(
    '${name}',
    '${sched}',
    $$select public.invoke_nextjs_cron('${escapedPath}');$$
  );`);
}

console.log(`end;
$repair$;

select jobname, schedule, active from cron.job
where jobname in ('generate-recurring-bookings', 'charge-recurring-bookings')
order by jobname;

select app_base_url, left(cron_secret, 8) || '…' as secret_prefix, updated_at
from public.cron_http_targets where singleton;
`);
