import type { OfficeOpsUptimeBar } from "@/lib/admin/officeOpsHealth";

/** System log rows that indicate database / Supabase connectivity issues. */
export function isDatabaseSystemLogRow(row: { source?: string | null; message?: string | null }): boolean {
  const text = `${row.source ?? ""} ${row.message ?? ""}`.toLowerCase();
  return (
    text.includes("supabase") ||
    text.includes("database") ||
    text.includes("postgres") ||
    text.includes("pgrst") ||
    text.includes("connection pool") ||
    text.includes("db probe")
  );
}

/** Cron jobs that power booking generation, lifecycle, and retries. */
export const BOOKING_ENGINE_CRON_JOBS = new Set([
  "generate-recurring-bookings",
  "charge-recurring-bookings",
  "charge-monthly-invoices",
  "booking-lifecycle",
  "retry-failed-jobs",
]);

const WEBSITE_SYSTEM_LOG_SOURCE_DENY = [
  "cron_run",
  "cron/",
  "production_health",
  "ops_health",
  "conversion_dashboard",
  "ops_health_alert",
];

const CRON_ERROR_NOISE_PREFIXES = ["[auth]", "[env]"];
const CRON_ERROR_NOISE_EXACT = new Set(["Unauthorized.", "[auth] Unauthorized."]);

/** Infra / scanner / cron mirror rows are not customer website outages. */
export function isWebsiteCustomerFacingSystemLog(row: {
  created_at: string | null;
  source?: string | null;
  message?: string | null;
}): boolean {
  if (isDatabaseSystemLogRow(row)) return false;
  const source = String(row.source ?? "").trim().toLowerCase();
  const message = String(row.message ?? "").trim().toLowerCase();
  if (!source && !message) return false;
  if (WEBSITE_SYSTEM_LOG_SOURCE_DENY.some((deny) => source.includes(deny))) return false;
  if (message.includes("ops_health") || message.includes("production_health_scan")) return false;
  if (message.includes("cron job") && message.includes("skipped")) return false;
  return true;
}

export function isCronRunNoiseMessage(message: string | null | undefined): boolean {
  const trimmed = String(message ?? "").trim();
  if (!trimmed) return false;
  if (CRON_ERROR_NOISE_EXACT.has(trimmed)) return true;
  if (CRON_ERROR_NOISE_PREFIXES.some((prefix) => trimmed.startsWith(prefix))) return true;
  if (/skipped.*lock/i.test(trimmed)) return true;
  if (trimmed.includes('"skipped":true') || trimmed.includes('"skipped": true')) return true;
  /** Legacy deploys queried `user_id`; production schema uses `customer_id`. Not an operational failure. */
  if (/column bookings\.user_id does not exist/i.test(trimmed)) return true;
  return false;
}

export type OfficeOpsCronErrorRow = {
  created_at: string | null;
  job_name?: string | null;
  message?: string | null;
};

export function filterBookingEngineCronErrors(rows: readonly OfficeOpsCronErrorRow[]): OfficeOpsCronErrorRow[] {
  return rows.filter((row) => {
    if (isCronRunNoiseMessage(row.message)) return false;
    const job = String(row.job_name ?? "").trim();
    if (!job) return false;
    return BOOKING_ENGINE_CRON_JOBS.has(job);
  });
}

export type OfficeOpsCronRunRow = OfficeOpsCronErrorRow & {
  status?: string | null;
};

export function filterBookingEngineCronSuccesses(rows: readonly OfficeOpsCronRunRow[]): OfficeOpsCronRunRow[] {
  return rows.filter((row) => {
    const job = String(row.job_name ?? "").trim();
    if (!job || !BOOKING_ENGINE_CRON_JOBS.has(job)) return false;
    return String(row.status ?? "").trim().toLowerCase() === "success";
  });
}

/** 30d booking-engine bars from cron outcomes — only penalize days with errors and no success. */
export function bookingEngineUptimeBarsFromSuccessCounts(
  days: string[],
  successByDay: Map<string, number>,
  errorByDay?: Map<string, number>,
): OfficeOpsUptimeBar[] {
  return days.map((day) => {
    if ((successByDay.get(day) ?? 0) > 0) return "ok";
    if (errorByDay && (errorByDay.get(day) ?? 0) > 0) return "warn";
    return "ok";
  });
}

/** Scanner/backfill signals — visible on Ops Health but must not degrade live booking-engine status. */
export function isBookingEngineScannerOnlyFindingCode(code: string): boolean {
  return isBookingEngineCronScheduleFindingCode(code) || code === "recurring_snapshot_drift";
}

/** Production scan codes that should affect booking-engine live status (dispatch/runtime — not template backfill). */
export function isBookingEngineLiveFindingCode(code: string): boolean {
  if (isBookingEngineScannerOnlyFindingCode(code)) return false;
  return (
    code === "dispatch_stale_unassigned" ||
    code === "workload_force_override_usage" ||
    code === "duration_fallback_usage"
  );
}

/** Schedule lag / missing cron success — scanner only, softer signal. */
export function isBookingEngineCronScheduleFindingCode(code: string): boolean {
  return code.includes("cron");
}

export function hasLiveBookingEngineFinding(
  findings: Array<{ code: string; severity: string; count: number }>,
  matcher: (code: string) => boolean,
): boolean {
  return findings.some(
    (finding) => matcher(finding.code) && (finding.severity === "critical" || finding.severity === "high") && finding.count > 0,
  );
}
