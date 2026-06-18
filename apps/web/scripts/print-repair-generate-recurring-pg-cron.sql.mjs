/**
 * Prints Supabase SQL to (re)schedule generate-recurring-bookings pg_cron.
 * Run: node scripts/print-repair-generate-recurring-pg-cron.sql.mjs
 * Paste output into Supabase Dashboard → SQL Editor → Run.
 *
 * Uses CRON_SECRET from apps/web/.env.local (must match Vercel Production).
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
  process.env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
}

const secret = process.env.CRON_SECRET?.trim();
if (!secret) {
  console.error("CRON_SECRET missing from .env.local");
  process.exit(1);
}

const domain = (process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://shalean.co.za").replace(/\/$/, "");
const host = domain.startsWith("http") ? domain : `https://${domain}`;
if (host.includes("localhost")) {
  console.warn("-- Warning: NEXT_PUBLIC_APP_URL is localhost; using https://shalean.co.za for pg_cron.");
}
const productionHost = host.includes("localhost") ? "https://shalean.co.za" : host;

// Escape single quotes for SQL string literals
const sqlSecret = secret.replace(/'/g, "''");
const url = `${productionHost}/api/cron/generate-recurring-bookings`.replace(/'/g, "''");

console.log(`-- Repair generate-recurring-bookings pg_cron
-- Production host: ${productionHost}
-- Verify charge job is healthy first:
--   select jobname, schedule, active from cron.job
--   where jobname in ('generate-recurring-bookings', 'charge-recurring-bookings');

do $$
declare
  r record;
begin
  for r in
    select jobid, jobname
    from cron.job
    where jobname = 'generate-recurring-bookings'
  loop
    perform cron.unschedule(r.jobid);
  end loop;
end
$$;

select cron.schedule(
  'generate-recurring-bookings',
  '*/10 * * * *',
  $$
  select net.http_post(
    url := '${url}',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ${sqlSecret}',
      'x-cron-secret', '${sqlSecret}'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- After ~10 minutes:
-- select job_name, status, message, created_at
-- from public.cron_runs
-- where job_name = 'generate-recurring-bookings'
-- order by created_at desc limit 5;
`);
