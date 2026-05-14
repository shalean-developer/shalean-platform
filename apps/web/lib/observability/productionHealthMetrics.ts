import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { logSystemEvent } from "@/lib/logging/systemLog";
import { recordSystemMetric } from "@/lib/observability/recordSystemMetric";
import {
  detectRecurringMonthlyDriftForRows,
  type RecurringMonthlyDriftBookingRow,
  type RecurringMonthlyDriftFinding,
  type RecurringMonthlyDriftInvoiceRow,
  type RecurringMonthlyDriftTemplateRow,
  type RecurringMonthlyDriftSeverity,
} from "@/lib/recurring/recurringMonthlyDriftProbes";

export type ProductionHealthSeverity = "critical" | "high" | "medium" | "low" | "info";

export type ProductionHealthCode =
  | "payment_verified_not_finalized"
  | "monthly_invoice_paid_child_unsettled"
  | "booking_completed_missing_earnings_basis"
  | "payout_eligibility_drift"
  | "recurring_snapshot_drift"
  | "duration_fallback_usage"
  | "dispatch_stale_unassigned"
  | "cron_stale_or_missing_success"
  | "workload_force_override_usage";

export type ProductionHealthFinding = {
  code: ProductionHealthCode;
  severity: ProductionHealthSeverity;
  count: number;
  message: string;
  sampleIds: string[];
  diagnostics?: Record<string, unknown>;
};

export type ProductionHealthSummary = {
  ok: true;
  generatedAt: string;
  scanLimit: number;
  findings: ProductionHealthFinding[];
  totals: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
  };
};

export type PaymentFinalizationSignalRow = {
  id?: string | null;
  type?: string | null;
  created_at?: string | null;
  payload?: unknown;
};

export type MonthlyInvoiceChildSettlementRow = {
  id?: string | null;
  monthly_invoice_id?: string | null;
  invoice_status?: string | null;
  status?: string | null;
  payment_status?: string | null;
  payout_status?: string | null;
  payout_frozen_cents?: number | null;
};

export type BookingEarningsHealthRow = {
  id?: string | null;
  status?: string | null;
  display_earnings_cents?: number | null;
  payout_frozen_cents?: number | null;
  cleaner_earnings_total_cents?: number | null;
  cleaner_payout_cents?: number | null;
  cleaner_id?: string | null;
  selected_cleaner_id?: string | null;
  team_id?: string | null;
  is_team_job?: boolean | null;
};

export type PayoutEligibilityHealthRow = {
  id?: string | null;
  payout_status?: string | null;
  payout_frozen_cents?: number | null;
  payout_paid_at?: string | null;
  payout_id?: string | null;
};

export type DispatchHealthRow = {
  id?: string | null;
  status?: string | null;
  payment_status?: string | null;
  payment_completed_at?: string | null;
  dispatch_status?: string | null;
  cleaner_id?: string | null;
  selected_cleaner_id?: string | null;
  team_id?: string | null;
  is_team_job?: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type CronRunHealthRow = {
  job_name?: string | null;
  status?: string | null;
  created_at?: string | null;
  message?: string | null;
};

export type ExpectedCronJob = {
  jobName: string;
  maxAgeMinutes: number;
  severity?: ProductionHealthSeverity;
};

export type SystemLogHealthRow = {
  id?: string | null;
  source?: string | null;
  message?: string | null;
  created_at?: string | null;
  context?: Record<string, unknown> | null;
};

export type ProductionHealthInput = {
  scanLimit?: number;
  now?: Date;
  paymentSignals?: readonly PaymentFinalizationSignalRow[];
  monthlyChildren?: readonly MonthlyInvoiceChildSettlementRow[];
  earningsRows?: readonly BookingEarningsHealthRow[];
  payoutRows?: readonly PayoutEligibilityHealthRow[];
  recurringRows?: readonly RecurringMonthlyDriftBookingRow[];
  recurringInvoicesById?: Map<string, RecurringMonthlyDriftInvoiceRow>;
  recurringTemplatesById?: Map<string, RecurringMonthlyDriftTemplateRow>;
  dispatchRows?: readonly DispatchHealthRow[];
  cronRows?: readonly CronRunHealthRow[];
  expectedCronJobs?: readonly ExpectedCronJob[];
  durationFallbackLogs?: readonly SystemLogHealthRow[];
  workloadForceOverrideLogs?: readonly SystemLogHealthRow[];
};

const DEFAULT_SCAN_LIMIT = 500;
const MAX_SCAN_LIMIT = 5_000;
const MAX_SAMPLE_IDS = 10;
const DEFAULT_DISPATCH_STALE_MINUTES = 45;

function clampLimit(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_SCAN_LIMIT;
  return Math.min(MAX_SCAN_LIMIT, Math.max(1, Math.round(n)));
}

function norm(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function hasText(value: unknown): boolean {
  return typeof value === "string" ? value.trim().length > 0 : value != null;
}

function positiveCents(value: unknown): boolean {
  const n = Number(value);
  return Number.isFinite(n) && n > 0;
}

function idOf(row: { id?: string | null }, fallback: string): string {
  const id = typeof row.id === "string" && row.id.trim() ? row.id.trim() : "";
  return id || fallback;
}

function isoAgeMinutes(iso: string | null | undefined, now: Date): number | null {
  if (!iso || !String(iso).trim()) return null;
  const t = new Date(String(iso).trim()).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.round((now.getTime() - t) / 60_000));
}

function sample(ids: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    const trimmed = String(id ?? "").trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
    if (out.length >= MAX_SAMPLE_IDS) break;
  }
  return out;
}

function addFinding(
  findings: ProductionHealthFinding[],
  code: ProductionHealthCode,
  severity: ProductionHealthSeverity,
  message: string,
  ids: string[],
  diagnostics?: Record<string, unknown>,
): void {
  if (ids.length === 0) return;
  findings.push({
    code,
    severity,
    count: ids.length,
    message,
    sampleIds: sample(ids),
    ...(diagnostics ? { diagnostics } : {}),
  });
}

function severityRank(severity: ProductionHealthSeverity): number {
  return { critical: 0, high: 1, medium: 2, low: 3, info: 4 }[severity];
}

function recurringSeverityToProduction(severity: RecurringMonthlyDriftSeverity): ProductionHealthSeverity {
  return severity;
}

function isCancelledLike(status: unknown): boolean {
  const s = norm(status);
  return s === "cancelled" || s === "refunded" || s === "failed" || s === "payment_expired" || s === "disputed";
}

function isPaidLike(status: unknown): boolean {
  const s = norm(status);
  return s === "paid" || s === "success" || s === "succeeded";
}

function hasAssignment(row: DispatchHealthRow): boolean {
  return Boolean(row.cleaner_id || row.selected_cleaner_id || row.team_id || row.is_team_job === true);
}

function hasEarningsBasis(row: BookingEarningsHealthRow): boolean {
  return (
    positiveCents(row.display_earnings_cents) ||
    positiveCents(row.payout_frozen_cents) ||
    positiveCents(row.cleaner_earnings_total_cents) ||
    positiveCents(row.cleaner_payout_cents)
  );
}

export function detectPaymentFinalizationDrift(rows: readonly PaymentFinalizationSignalRow[]): ProductionHealthFinding[] {
  const ids = rows
    .filter((row) => {
      const type = norm(row.type);
      return type === "booking_finalize" || type === "booking_insert" || type === "payment_reconciliation";
    })
    .map((row, i) => idOf(row, `payment-signal-${i}`));

  const findings: ProductionHealthFinding[] = [];
  addFinding(
    findings,
    "payment_verified_not_finalized",
    "critical",
    "Verified Paystack payment has an unresolved finalization/reconciliation job.",
    ids,
  );
  return findings;
}

export function detectMonthlyInvoiceChildSettlementDrift(
  rows: readonly MonthlyInvoiceChildSettlementRow[],
): ProductionHealthFinding[] {
  const ids = rows
    .filter((row) => {
      if (norm(row.invoice_status) !== "paid") return false;
      if (isCancelledLike(row.status)) return false;
      return norm(row.payment_status) !== "success" || norm(row.payout_status) !== "eligible" || !positiveCents(row.payout_frozen_cents);
    })
    .map((row, i) => idOf(row, `monthly-child-${i}`));
  const findings: ProductionHealthFinding[] = [];
  addFinding(
    findings,
    "monthly_invoice_paid_child_unsettled",
    "critical",
    "Paid monthly invoice has non-cancelled child bookings that are not fully settled.",
    ids,
  );
  return findings;
}

export function detectCompletedMissingEarningsBasis(rows: readonly BookingEarningsHealthRow[]): ProductionHealthFinding[] {
  const ids = rows
    .filter((row) => norm(row.status) === "completed" && !hasEarningsBasis(row))
    .map((row, i) => idOf(row, `completed-booking-${i}`));
  const findings: ProductionHealthFinding[] = [];
  addFinding(
    findings,
    "booking_completed_missing_earnings_basis",
    "critical",
    "Completed bookings are missing display/frozen/ledger earnings basis.",
    ids,
  );
  return findings;
}

export function detectPayoutEligibilityDrift(rows: readonly PayoutEligibilityHealthRow[]): ProductionHealthFinding[] {
  const ids = rows
    .filter((row) => {
      const ps = norm(row.payout_status);
      if (ps === "eligible" || ps === "approved" || ps === "processing") return !positiveCents(row.payout_frozen_cents);
      if (ps === "paid") return !hasText(row.payout_paid_at);
      return false;
    })
    .map((row, i) => idOf(row, `payout-row-${i}`));
  const findings: ProductionHealthFinding[] = [];
  addFinding(
    findings,
    "payout_eligibility_drift",
    "high",
    "Payout status does not have the expected frozen basis or paid marker.",
    ids,
  );
  return findings;
}

export function aggregateRecurringSnapshotDrift(findings: readonly RecurringMonthlyDriftFinding[]): ProductionHealthFinding[] {
  const drift = findings.filter((f) =>
    f.code === "recurring_stale_pricing_drift" ||
    f.code === "recurring_stale_duration_drift" ||
    f.code === "recurring_child_extras_parity_mismatch" ||
    f.code === "recurring_child_missing_duration_minutes"
  );
  if (drift.length === 0) return [];

  const worst = drift.reduce<ProductionHealthSeverity>((acc, f) => {
    const next = recurringSeverityToProduction(f.severity);
    return severityRank(next) < severityRank(acc) ? next : acc;
  }, "info");

  return [
    {
      code: "recurring_snapshot_drift",
      severity: worst,
      count: drift.length,
      message: "Recurring child snapshot, duration, extras, or price drift was detected.",
      sampleIds: sample(drift.map((f, i) => f.bookingId ?? f.recurringId ?? `recurring-drift-${i}`)),
      diagnostics: {
        by_code: drift.reduce<Record<string, number>>((acc, f) => {
          acc[f.code] = (acc[f.code] ?? 0) + 1;
          return acc;
        }, {}),
      },
    },
  ];
}

export function detectStaleUnassignedDispatch(
  rows: readonly DispatchHealthRow[],
  now: Date,
  staleMinutes = DEFAULT_DISPATCH_STALE_MINUTES,
): ProductionHealthFinding[] {
  const ids = rows
    .filter((row) => {
      if (!isPaidLike(row.payment_status) || hasAssignment(row) || isCancelledLike(row.status)) return false;
      const dispatch = norm(row.dispatch_status);
      const relevant = dispatch === "searching" || dispatch === "failed" || dispatch === "no_cleaner" || dispatch === "unassignable" || dispatch === "";
      if (!relevant) return false;
      const age = isoAgeMinutes(row.payment_completed_at ?? row.updated_at ?? row.created_at, now);
      return age != null && age >= staleMinutes;
    })
    .map((row, i) => idOf(row, `dispatch-row-${i}`));
  const findings: ProductionHealthFinding[] = [];
  addFinding(
    findings,
    "dispatch_stale_unassigned",
    "high",
    "Paid bookings remain unassigned or terminal-dispatch stale beyond the operations threshold.",
    ids,
    { stale_minutes: staleMinutes },
  );
  return findings;
}

export function detectDurationFallbackUsage(rows: readonly SystemLogHealthRow[]): ProductionHealthFinding[] {
  const ids = rows
    .filter((row) => {
      const msg = norm(row.message);
      const source = norm(row.source);
      return msg.includes("duration_fallback") || msg.includes("duration fallback") || source.includes("duration_fallback");
    })
    .map((row, i) => idOf(row, `duration-fallback-${i}`));
  const findings: ProductionHealthFinding[] = [];
  addFinding(
    findings,
    "duration_fallback_usage",
    "medium",
    "Duration fallback was used in workload or pricing diagnostics.",
    ids,
  );
  return findings;
}

export function detectWorkloadForceOverrides(rows: readonly SystemLogHealthRow[]): ProductionHealthFinding[] {
  const ids = rows
    .filter((row) => {
      const msg = norm(row.message);
      const ctx = row.context ?? {};
      return (
        msg.includes("admin_daily_workload_over_limit_force_override") ||
        msg.includes("workload_over_limit_force") ||
        ctx.workloadOverrideCode === "admin_daily_workload_over_limit_force_override"
      );
    })
    .map((row, i) => idOf(row, `workload-force-${i}`));
  const findings: ProductionHealthFinding[] = [];
  addFinding(
    findings,
    "workload_force_override_usage",
    "medium",
    "Admin force assignment over the 8-hour workload policy was used.",
    ids,
  );
  return findings;
}

export function detectStaleCronRuns(
  rows: readonly CronRunHealthRow[],
  expectedJobs: readonly ExpectedCronJob[],
  now: Date,
): ProductionHealthFinding[] {
  const byJob = new Map<string, CronRunHealthRow[]>();
  for (const row of rows) {
    const job = typeof row.job_name === "string" ? row.job_name.trim() : "";
    if (!job) continue;
    const bucket = byJob.get(job) ?? [];
    bucket.push(row);
    byJob.set(job, bucket);
  }

  const stale: string[] = [];
  const missing: string[] = [];
  const maxAges: Record<string, number> = {};

  for (const expected of expectedJobs) {
    const jobRows = byJob.get(expected.jobName) ?? [];
    const successes = jobRows
      .filter((row) => norm(row.status) === "success")
      .map((row) => row.created_at)
      .filter((iso): iso is string => typeof iso === "string" && iso.trim().length > 0)
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
    const latest = successes[0] ?? null;
    maxAges[expected.jobName] = expected.maxAgeMinutes;
    if (!latest) {
      missing.push(expected.jobName);
      continue;
    }
    const age = isoAgeMinutes(latest, now);
    if (age == null || age > expected.maxAgeMinutes) stale.push(expected.jobName);
  }

  const ids = [...missing, ...stale];
  const findings: ProductionHealthFinding[] = [];
  addFinding(
    findings,
    "cron_stale_or_missing_success",
    "high",
    "Critical cron jobs have no recent successful run.",
    ids,
    { missing, stale, max_age_minutes_by_job: maxAges },
  );
  return findings;
}

export function buildProductionHealthSummary(input: ProductionHealthInput): ProductionHealthSummary {
  const now = input.now ?? new Date();
  const scanLimit = clampLimit(input.scanLimit);
  const recurringDrift = detectRecurringMonthlyDriftForRows((input.recurringRows ?? []).slice(0, scanLimit), {
    invoicesById: input.recurringInvoicesById,
    recurringTemplatesById: input.recurringTemplatesById,
  });

  const findings = [
    ...detectPaymentFinalizationDrift((input.paymentSignals ?? []).slice(0, scanLimit)),
    ...detectMonthlyInvoiceChildSettlementDrift((input.monthlyChildren ?? []).slice(0, scanLimit)),
    ...detectCompletedMissingEarningsBasis((input.earningsRows ?? []).slice(0, scanLimit)),
    ...detectPayoutEligibilityDrift((input.payoutRows ?? []).slice(0, scanLimit)),
    ...aggregateRecurringSnapshotDrift(recurringDrift),
    ...detectDurationFallbackUsage((input.durationFallbackLogs ?? []).slice(0, scanLimit)),
    ...detectStaleUnassignedDispatch((input.dispatchRows ?? []).slice(0, scanLimit), now),
    ...detectStaleCronRuns(input.cronRows ?? [], input.expectedCronJobs ?? [], now),
    ...detectWorkloadForceOverrides((input.workloadForceOverrideLogs ?? []).slice(0, scanLimit)),
  ].sort((a, b) => severityRank(a.severity) - severityRank(b.severity) || a.code.localeCompare(b.code));

  const totals = findings.reduce<ProductionHealthSummary["totals"]>(
    (acc, finding) => {
      acc[finding.severity] += finding.count;
      return acc;
    },
    { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
  );

  return {
    ok: true,
    generatedAt: now.toISOString(),
    scanLimit,
    findings,
    totals,
  };
}

export async function recordProductionHealthMetric(input: {
  metric: string;
  value: number;
  metadata?: Record<string, unknown>;
  log?: boolean;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await recordSystemMetric({
      metric: input.metric,
      value: input.value,
      metadata: input.metadata,
    });
    if (input.log !== false) {
      await logSystemEvent({
        level: "info",
        source: "production_health",
        message: "production_health_metric_recorded",
        context: {
          metric: input.metric,
          value: input.value,
          ...(input.metadata ? { metadata: input.metadata } : {}),
        },
      });
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function recordProductionHealthSummaryMetrics(summary: ProductionHealthSummary): Promise<void> {
  const metadata = {
    generated_at: summary.generatedAt,
    finding_count: summary.findings.length,
    sample_codes: summary.findings.slice(0, 20).map((f) => f.code),
  };
  await Promise.all([
    recordProductionHealthMetric({ metric: "production_health.findings.critical", value: summary.totals.critical, metadata }),
    recordProductionHealthMetric({ metric: "production_health.findings.high", value: summary.totals.high, metadata }),
    recordProductionHealthMetric({ metric: "production_health.findings.medium", value: summary.totals.medium, metadata }),
    recordProductionHealthMetric({ metric: "production_health.findings.low", value: summary.totals.low, metadata }),
  ]).catch(() => undefined);
}

export const DEFAULT_PRODUCTION_HEALTH_CRON_JOBS: ExpectedCronJob[] = [
  { jobName: "generate-recurring-bookings", maxAgeMinutes: 30, severity: "high" },
  { jobName: "charge-monthly-invoices", maxAgeMinutes: 26 * 60, severity: "high" },
  { jobName: "booking-lifecycle", maxAgeMinutes: 90, severity: "high" },
  { jobName: "retry-failed-jobs", maxAgeMinutes: 90, severity: "high" },
  { jobName: "payout-integrity-daily", maxAgeMinutes: 26 * 60, severity: "high" },
];

export async function runProductionHealthScan(
  admin: SupabaseClient,
  options?: {
    scanLimit?: number;
    now?: Date;
    expectedCronJobs?: readonly ExpectedCronJob[];
    recordMetrics?: boolean;
  },
): Promise<ProductionHealthSummary> {
  const scanLimit = clampLimit(options?.scanLimit);
  try {
    const since24h = new Date((options?.now ?? new Date()).getTime() - 24 * 60 * 60_000).toISOString();
    const [failedJobs, monthlyChildren, earningsRows, payoutRows, recurringRows, invoices, dispatchRows, cronRows, durationLogs, workloadLogs] =
      await Promise.all([
        admin
          .from("failed_jobs")
          .select("id, type, created_at, payload")
          .in("type", ["booking_finalize", "booking_insert", "payment_reconciliation"])
          .order("created_at", { ascending: false })
          .limit(scanLimit),
        admin
          .from("bookings")
          .select("id, monthly_invoice_id, status, payment_status, payout_status, payout_frozen_cents, monthly_invoices!inner(status)")
          .not("monthly_invoice_id", "is", null)
          .order("created_at", { ascending: false })
          .limit(scanLimit),
        admin
          .from("bookings")
          .select("id, status, display_earnings_cents, payout_frozen_cents, cleaner_earnings_total_cents, cleaner_payout_cents, cleaner_id, selected_cleaner_id, team_id, is_team_job")
          .eq("status", "completed")
          .order("created_at", { ascending: false })
          .limit(scanLimit),
        admin
          .from("bookings")
          .select("id, payout_status, payout_frozen_cents, payout_paid_at, payout_id")
          .in("payout_status", ["eligible", "approved", "processing", "paid"])
          .order("created_at", { ascending: false })
          .limit(scanLimit),
        admin
          .from("bookings")
          .select("id, recurring_id, is_recurring_generated, is_monthly_billing_booking, billing_type, monthly_invoice_id, status, payment_status, payout_status, payout_frozen_cents, display_earnings_cents, cleaner_payout_cents, cleaner_id, selected_cleaner_id, is_team_job, team_id, duration_minutes, extras, booking_snapshot, price_snapshot, total_paid_zar, amount_paid_cents")
          .or("is_recurring_generated.eq.true,recurring_id.not.is.null,is_monthly_billing_booking.eq.true")
          .order("created_at", { ascending: false })
          .limit(scanLimit),
        admin.from("monthly_invoices").select("id, status").order("created_at", { ascending: false }).limit(scanLimit),
        admin
          .from("bookings")
          .select("id, status, payment_status, payment_completed_at, dispatch_status, cleaner_id, selected_cleaner_id, team_id, is_team_job, created_at, updated_at")
          .in("payment_status", ["paid", "success", "succeeded"])
          .order("payment_completed_at", { ascending: false, nullsFirst: false })
          .limit(scanLimit),
        admin.from("cron_runs").select("job_name, status, created_at, message").order("created_at", { ascending: false }).limit(2000),
        admin
          .from("system_logs")
          .select("id, source, message, created_at, context")
          .gte("created_at", since24h)
          .or("message.ilike.%duration_fallback%,message.ilike.%duration fallback%,source.ilike.%duration_fallback%")
          .order("created_at", { ascending: false })
          .limit(scanLimit),
        admin
          .from("system_logs")
          .select("id, source, message, created_at, context")
          .gte("created_at", since24h)
          .or("message.ilike.%admin_daily_workload_over_limit_force_override%,message.ilike.%workload_over_limit_force%")
          .order("created_at", { ascending: false })
          .limit(scanLimit),
      ]);

    const invoiceMap = new Map<string, RecurringMonthlyDriftInvoiceRow>();
    for (const row of invoices.data ?? []) {
      const r = row as RecurringMonthlyDriftInvoiceRow;
      if (r.id) invoiceMap.set(r.id, r);
    }

    const monthlyChildRows = (monthlyChildren.data ?? []).map((row) => {
      const r = row as MonthlyInvoiceChildSettlementRow & { monthly_invoices?: { status?: string | null } | null };
      return { ...r, invoice_status: r.monthly_invoices?.status ?? r.invoice_status ?? null };
    });

    const summary = buildProductionHealthSummary({
      now: options?.now,
      scanLimit,
      paymentSignals: (failedJobs.data ?? []) as PaymentFinalizationSignalRow[],
      monthlyChildren: monthlyChildRows,
      earningsRows: (earningsRows.data ?? []) as BookingEarningsHealthRow[],
      payoutRows: (payoutRows.data ?? []) as PayoutEligibilityHealthRow[],
      recurringRows: (recurringRows.data ?? []) as RecurringMonthlyDriftBookingRow[],
      recurringInvoicesById: invoiceMap,
      dispatchRows: (dispatchRows.data ?? []) as DispatchHealthRow[],
      cronRows: (cronRows.data ?? []) as CronRunHealthRow[],
      expectedCronJobs: options?.expectedCronJobs ?? DEFAULT_PRODUCTION_HEALTH_CRON_JOBS,
      durationFallbackLogs: (durationLogs.data ?? []) as SystemLogHealthRow[],
      workloadForceOverrideLogs: (workloadLogs.data ?? []) as SystemLogHealthRow[],
    });

    if (options?.recordMetrics === true) await recordProductionHealthSummaryMetrics(summary);
    return summary;
  } catch (err) {
    const summary = buildProductionHealthSummary({ now: options?.now, scanLimit });
    await logSystemEvent({
      level: "error",
      source: "production_health",
      message: "production_health_scan_failed",
      context: { error: err instanceof Error ? err.message : String(err) },
    }).catch(() => undefined);
    return summary;
  }
}
