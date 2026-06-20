/**
 * Prints Supabase SQL to repair pg_cron HTTP jobs that drive Ops Health "Booking engine".
 *
 * Run from apps/web (uses production host + CRON_SECRET from .env.local — must match Vercel):
 *   node scripts/print-repair-booking-engine-pg-cron.sql.mjs
 *
 * Paste output into Supabase Dashboard → SQL Editor → Run.
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
const productionHost = host.includes("localhost") ? "https://shalean.co.za" : host;

const sqlSecret = secret.replace(/'/g, "''");

function cronJobBlock(jobName, schedule, path, everyMinute = false) {
  const url = `${productionHost}${path}`.replace(/'/g, "''");
  const sched = everyMinute ? "* * * * *" : schedule;
  return `
-- ${jobName} → ${path}
do $$
declare r record;
begin
  for r in select jobid from cron.job where jobname = '${jobName}' loop
    perform cron.unschedule(r.jobid);
  end loop;
end $$;

select cron.schedule(
  '${jobName}',
  '${sched}',
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
);`;
}

console.log(`-- Repair booking-engine pg_cron jobs
-- Production host: ${productionHost}
-- Jobs: booking-lifecycle-job, retry-failed-jobs, generate-recurring-bookings
--
-- Verify:
--   select jobname, schedule, active from cron.job
--   where jobname in ('booking-lifecycle-job','retry-failed-jobs','generate-recurring-bookings');
--
-- After ~15 minutes:
--   select job_name, status, message, created_at from cron_runs
--   where job_name in ('booking-lifecycle','retry-failed-jobs','generate-recurring-bookings')
--   order by created_at desc limit 15;

create extension if not exists pg_cron;
create extension if not exists pg_net;
`);

console.log(
  cronJobBlock("booking-lifecycle-job", "*/5 * * * *", "/api/cron/booking-lifecycle"),
);
console.log(cronJobBlock("retry-failed-jobs", "* * * * *", "/api/cron/retry-failed-jobs", true));
console.log(
  cronJobBlock("generate-recurring-bookings", "*/10 * * * *", "/api/cron/generate-recurring-bookings"),
);
