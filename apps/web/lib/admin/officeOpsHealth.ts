import { formatIsoInJohannesburgYmd, todayYmdJohannesburg } from "@/lib/booking/dateInJohannesburg";
import type { ProductionHealthFinding, ProductionHealthSummary } from "@/lib/observability/productionHealthMetrics";
import {
  deriveServiceHealthFindings,
  evaluateUnifiedPlatformStatus,
  mergeUnifiedHealthFindings,
  unifiedStatusDescription,
  validateHealthConsistency,
  type UnifiedIssueBreakdown,
  type UnifiedOpsHealthStatus,
} from "@/lib/observability/unifiedOpsHealth";

export type OfficeOpsServiceStatus = "operational" | "degraded" | "down" | "maintenance";
export type OfficeOpsUptimeBar = "ok" | "warn" | "down";
export type OfficeOpsServiceId = "website" | "booking_engine" | "payment_gateway" | "database" | "notifications";

export type OfficeOpsServiceCard = {
  id: OfficeOpsServiceId;
  name: string;
  description: string;
  /** Worst of {@link currentStatus} and {@link periodStatus}. */
  status: OfficeOpsServiceStatus;
  /** Live / recent signal (last hour to 24h). */
  currentStatus: OfficeOpsServiceStatus;
  /** Derived from the 30-day uptime bar — matches the chart. */
  periodStatus: OfficeOpsServiceStatus;
  uptimePct: number | null;
  latencyLabel: string | null;
  lastCheckedLabel: string;
  uptimeBars: OfficeOpsUptimeBar[];
  currentDetail: string | null;
  periodDetail: string | null;
};

export type OfficeOpsHealthSummary = {
  fetchedAt: string;
  overallStatus: OfficeOpsServiceStatus;
  overallCurrentStatus: OfficeOpsServiceStatus;
  overallPeriodStatus: OfficeOpsServiceStatus;
  allOperational: boolean;
  allOperationalNow: boolean;
  services: OfficeOpsServiceCard[];
  kpis: {
    monitored: number;
    healthyNow: number;
    issuesNow: number;
    healthy30d: number;
    issues30d: number;
    avgUptimePct: number | null;
  };
  productionHealth: {
    status: "healthy" | "degraded" | "critical";
    generatedAt: string;
    scanLimit: number;
    findings: Array<{
      code: string;
      severity: string;
      count: number;
      message: string;
      sampleIds: string[];
    }>;
    totals: ProductionHealthSummary["totals"];
    totalFindings: number;
  };
  error?: string;
  unified: {
    status: UnifiedOpsHealthStatus;
    issueBreakdown: UnifiedIssueBreakdown;
    consistencyValid: boolean;
    statusDescription: string;
  };
  scanner: {
    ok: true;
    status: "healthy" | "degraded" | "critical" | "down";
    degraded: boolean;
    error?: string;
    generatedAt: string;
    lastScan: {
      source: "unified_ops_health";
      scanLimit: number;
      metricsRecorded: boolean;
      degraded: boolean;
    };
    counts: ProductionHealthSummary["totals"] & {
      totalFindings: number;
      acknowledgedHidden: number;
    };
    summaries: ProductionHealthFinding[];
    acknowledgedSummaries: ProductionHealthFinding[];
    acknowledgements: Array<{
      key: string;
      code: string;
      sampleIds: string[];
      status: "acknowledged" | "resolved";
      note?: string;
      operatorId?: string;
      operatorEmail?: string;
      createdAt: string;
    }>;
    sampleIds: Record<string, string[]>;
  };
};

const UPTIME_DAYS = 30;

export function lastJohannesburgYmds(count: number, now = new Date()): string[] {
  const anchor = new Date(`${todayYmdJohannesburg(now)}T12:00:00+02:00`);
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(anchor);
    d.setDate(anchor.getDate() - i);
    out.push(todayYmdJohannesburg(d));
  }
  return out;
}

export function countByJohannesburgDay(rows: Array<{ created_at: string | null | undefined }>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (!row.created_at) continue;
    const ymd = formatIsoInJohannesburgYmd(row.created_at);
    counts.set(ymd, (counts.get(ymd) ?? 0) + 1);
  }
  return counts;
}

export function barsFromDailyCounts(
  days: string[],
  counts: Map<string, number>,
  thresholds: { warn: number; down: number },
): OfficeOpsUptimeBar[] {
  return days.map((day) => {
    const count = counts.get(day) ?? 0;
    if (count >= thresholds.down) return "down";
    if (count >= thresholds.warn) return "warn";
    return "ok";
  });
}

export function uptimePctFromBars(bars: OfficeOpsUptimeBar[]): number | null {
  if (bars.length === 0) return null;
  const ok = bars.filter((bar) => bar === "ok").length;
  return Math.round((ok / bars.length) * 1000) / 10;
}

const STATUS_RANK: Record<OfficeOpsServiceStatus, number> = {
  operational: 0,
  maintenance: 1,
  degraded: 2,
  down: 3,
};

export function mergeOfficeOpsStatus(...statuses: OfficeOpsServiceStatus[]): OfficeOpsServiceStatus {
  return statuses.reduce(
    (worst, status) => (STATUS_RANK[status] > STATUS_RANK[worst] ? status : worst),
    "operational",
  );
}

/** Maps the 30-day bar strip to a single status label. */
export function statusFromUptimeBars(bars: OfficeOpsUptimeBar[]): OfficeOpsServiceStatus {
  if (bars.length === 0) return "operational";
  const downDays = bars.filter((bar) => bar === "down").length;
  const warnDays = bars.filter((bar) => bar === "warn").length;
  if (downDays >= 4 || downDays / bars.length >= 0.15) return "down";
  if (downDays > 0 || warnDays > 0) return "degraded";
  return "operational";
}

function buildServiceCard(
  card: Omit<OfficeOpsServiceCard, "status">,
): OfficeOpsServiceCard {
  return {
    ...card,
    status: mergeOfficeOpsStatus(card.currentStatus, card.periodStatus),
  };
}

export function formatOfficeOpsLatency(ms: number | null | undefined): string | null {
  if (ms == null || !Number.isFinite(ms)) return null;
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function formatOfficeOpsRelativeTime(iso: string | null | undefined, now = new Date()): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "—";
  const diffMs = now.getTime() - t;
  if (diffMs < 60_000) return "Just now";
  if (diffMs < 3_600_000) return `${Math.max(1, Math.round(diffMs / 60_000))}m ago`;
  if (diffMs < 86_400_000) return `${Math.max(1, Math.round(diffMs / 3_600_000))}h ago`;
  return new Date(t).toLocaleString("en-ZA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function hasFindingCode(findings: ProductionHealthFinding[], matcher: (code: string) => boolean): boolean {
  return findings.some((finding) => matcher(finding.code) && (finding.severity === "critical" || finding.severity === "high"));
}

type NotificationHealthRow = { created_at: string | null; status: string | null; error?: string | null };

/** Provider misconfiguration — not counted as a live delivery failure once keys are fixed. */
export function isNotificationProviderConfigError(error: string | null | undefined): boolean {
  const e = String(error ?? "").toLowerCase();
  if (!e) return false;
  return (
    e.includes("api key is invalid") ||
    e.includes("resend_not_configured") ||
    e.includes("twilio_not_configured") ||
    e.includes("twilio_401") ||
    e.includes("twilio_auth_failed") ||
    e.includes('"code":20003') ||
    e.includes("authenticate")
  );
}

function isNotificationDeliveryAttempt(row: NotificationHealthRow): boolean {
  const status = String(row.status ?? "").toLowerCase();
  if (status === "sent") return true;
  if (status === "failed") return !isNotificationProviderConfigError(row.error);
  return false;
}

function notificationDeliveryRows(rows: readonly NotificationHealthRow[]): NotificationHealthRow[] {
  return rows.filter(isNotificationDeliveryAttempt);
}

export function buildOfficeOpsHealthSummary(params: {
  fetchedAt: string;
  productionHealth: ProductionHealthSummary | null;
  productionHealthError?: string;
  dbLatencyMs: number | null;
  dbOk: boolean;
  systemErrorRows: Array<{ created_at: string | null }>;
  cronErrorRows: Array<{ created_at: string | null }>;
  notificationRows: NotificationHealthRow[];
  whatsappPausedUntil: string | null;
  customerOutboundPausedUntil?: string | null;
  notificationsQueryOk: boolean;
}): OfficeOpsHealthSummary {
  const days = lastJohannesburgYmds(UPTIME_DAYS, new Date(params.fetchedAt));
  const systemErrorsByDay = countByJohannesburgDay(params.systemErrorRows);
  const cronErrorsByDay = countByJohannesburgDay(params.cronErrorRows);
  const deliveryNotificationRows = notificationDeliveryRows(params.notificationRows);

  const notificationFailuresByDay = countByJohannesburgDay(
    deliveryNotificationRows.filter((row) => String(row.status ?? "").toLowerCase() === "failed"),
  );
  const notificationAttemptsByDay = countByJohannesburgDay(deliveryNotificationRows);

  const findings = params.productionHealth?.findings ?? [];
  const bookingFinding = hasFindingCode(findings, (code) =>
    code.includes("dispatch") || code.includes("cron") || code.includes("recurring") || code.includes("duration") || code.includes("workload"),
  );
  const paymentFinding = hasFindingCode(findings, (code) =>
    code.includes("payment") || code.includes("invoice") || code.includes("payout"),
  );
  const criticalFinding = (params.productionHealth?.totals.critical ?? 0) > 0;

  const recentSystemErrors = params.systemErrorRows.filter((row) => {
    const t = Date.parse(row.created_at ?? "");
    return Number.isFinite(t) && t >= Date.parse(params.fetchedAt) - 3_600_000;
  }).length;
  const recentCronErrors = params.cronErrorRows.filter((row) => {
    const t = Date.parse(row.created_at ?? "");
    return Number.isFinite(t) && t >= Date.parse(params.fetchedAt) - 24 * 3_600_000;
  }).length;

  const notificationFailed = deliveryNotificationRows.filter((row) => String(row.status ?? "").toLowerCase() === "failed").length;
  const notificationSent = deliveryNotificationRows.filter((row) => String(row.status ?? "").toLowerCase() === "sent").length;
  const notificationAttempts = notificationSent + notificationFailed;
  const notificationSuccessRate = notificationAttempts > 0 ? (notificationSent / notificationAttempts) * 100 : null;

  const currentNotificationRows = deliveryNotificationRows.filter((row) => {
    const t = Date.parse(row.created_at ?? "");
    return Number.isFinite(t) && t >= Date.parse(params.fetchedAt) - 3_600_000;
  });
  const currentNotificationFailed = currentNotificationRows.filter((row) => String(row.status ?? "").toLowerCase() === "failed").length;
  const currentNotificationSent = currentNotificationRows.filter((row) => String(row.status ?? "").toLowerCase() === "sent").length;
  const currentNotificationAttempts = currentNotificationFailed + currentNotificationSent;
  const currentNotificationSuccessRate =
    currentNotificationAttempts > 0 ? (currentNotificationSent / currentNotificationAttempts) * 100 : null;
  const whatsappPaused =
    typeof params.whatsappPausedUntil === "string" && Date.parse(params.whatsappPausedUntil) > Date.parse(params.fetchedAt);
  const customerOutboundPaused =
    typeof params.customerOutboundPausedUntil === "string" &&
    Date.parse(params.customerOutboundPausedUntil) > Date.parse(params.fetchedAt);

  const websiteBars = barsFromDailyCounts(days, systemErrorsByDay, { warn: 1, down: 5 });
  const bookingBars = barsFromDailyCounts(days, cronErrorsByDay, { warn: 1, down: 3 });
  const paymentBars = barsFromDailyCounts(days, cronErrorsByDay, { warn: 1, down: 4 });
  const dbBars = barsFromDailyCounts(days, cronErrorsByDay, { warn: 2, down: 6 });
  const notificationBars = barsFromDailyCounts(
    days,
    new Map(
      days.map((day) => {
        const attempts = notificationAttemptsByDay.get(day) ?? 0;
        const failed = notificationFailuresByDay.get(day) ?? 0;
        if (attempts === 0) return [day, 0];
        const failRate = failed / attempts;
        if (failRate >= 0.25) return [day, 5];
        if (failRate >= 0.1) return [day, 2];
        return [day, 0];
      }),
    ),
    { warn: 2, down: 5 },
  );

  const websiteCurrent: OfficeOpsServiceStatus =
    recentSystemErrors >= 10 ? "down" : recentSystemErrors > 0 ? "degraded" : "operational";
  const bookingCurrent: OfficeOpsServiceStatus = criticalFinding
    ? "down"
    : bookingFinding || recentCronErrors > 0
      ? "degraded"
      : "operational";
  const paymentCurrent: OfficeOpsServiceStatus = criticalFinding && paymentFinding
    ? "down"
    : paymentFinding
      ? "degraded"
      : "operational";
  const databaseCurrent: OfficeOpsServiceStatus = !params.dbOk
    ? "down"
    : params.dbLatencyMs != null && params.dbLatencyMs > 800
      ? "degraded"
      : "operational";
  const notificationCurrent: OfficeOpsServiceStatus = !params.notificationsQueryOk
    ? "down"
    : customerOutboundPaused
      ? "maintenance"
      : whatsappPaused
        ? "maintenance"
        : currentNotificationAttempts === 0
          ? "operational"
          : currentNotificationSuccessRate != null && currentNotificationSuccessRate < 20
            ? "down"
            : currentNotificationSuccessRate != null && currentNotificationSuccessRate < 95
              ? "degraded"
              : "operational";

  const websitePeriod = statusFromUptimeBars(websiteBars);
  const bookingPeriod = mergeOfficeOpsStatus(statusFromUptimeBars(bookingBars), bookingFinding ? "degraded" : "operational");
  const paymentPeriod = mergeOfficeOpsStatus(statusFromUptimeBars(paymentBars), paymentFinding ? "degraded" : "operational");
  const databasePeriod = statusFromUptimeBars(dbBars);
  const notificationPeriod = customerOutboundPaused ? "maintenance" : statusFromUptimeBars(notificationBars);

  const services: OfficeOpsServiceCard[] = [
    buildServiceCard({
      id: "website",
      name: "Website",
      description: "Customer-facing booking site",
      currentStatus: websiteCurrent,
      periodStatus: websitePeriod,
      uptimePct: uptimePctFromBars(websiteBars),
      latencyLabel: null,
      lastCheckedLabel: formatOfficeOpsRelativeTime(params.fetchedAt),
      uptimeBars: websiteBars,
      currentDetail: recentSystemErrors > 0 ? `${recentSystemErrors} system error(s) in the last hour` : "No system errors in the last hour",
      periodDetail:
        websitePeriod !== "operational"
          ? `${uptimePctFromBars(websiteBars) ?? 0}% clean days in the last 30 days`
          : "Stable over the last 30 days",
    }),
    buildServiceCard({
      id: "booking_engine",
      name: "Booking engine",
      description: "Core booking flow and availability",
      currentStatus: bookingCurrent,
      periodStatus: bookingPeriod,
      uptimePct: uptimePctFromBars(bookingBars),
      latencyLabel: null,
      lastCheckedLabel: formatOfficeOpsRelativeTime(params.productionHealth?.generatedAt ?? params.fetchedAt),
      uptimeBars: bookingBars,
      currentDetail: bookingFinding
        ? "Production scan flagged booking or cron drift"
        : recentCronErrors > 0
          ? `${recentCronErrors} cron error(s) in 24h`
          : "No booking drift detected right now",
      periodDetail:
        bookingPeriod !== "operational"
          ? `${uptimePctFromBars(bookingBars) ?? 0}% clean cron days in 30d`
          : "Cron history clean over 30 days",
    }),
    buildServiceCard({
      id: "payment_gateway",
      name: "Payment gateway",
      description: "Paystack and settlement pipeline",
      currentStatus: paymentCurrent,
      periodStatus: paymentPeriod,
      uptimePct: uptimePctFromBars(paymentBars),
      latencyLabel: null,
      lastCheckedLabel: formatOfficeOpsRelativeTime(params.productionHealth?.generatedAt ?? params.fetchedAt),
      uptimeBars: paymentBars,
      currentDetail: paymentFinding ? "Payment or payout drift detected" : "No payment drift detected",
      periodDetail:
        paymentPeriod !== "operational"
          ? `${uptimePctFromBars(paymentBars) ?? 0}% clean days in 30d`
          : "Stable over the last 30 days",
    }),
    buildServiceCard({
      id: "database",
      name: "Supabase (DB)",
      description: "Primary database and auth",
      currentStatus: databaseCurrent,
      periodStatus: databasePeriod,
      uptimePct: uptimePctFromBars(dbBars),
      latencyLabel: formatOfficeOpsLatency(params.dbLatencyMs),
      lastCheckedLabel: formatOfficeOpsRelativeTime(params.fetchedAt),
      uptimeBars: dbBars,
      currentDetail: !params.dbOk
        ? "Database probe failed"
        : params.dbLatencyMs != null && params.dbLatencyMs > 800
          ? `Probe latency ${formatOfficeOpsLatency(params.dbLatencyMs)}`
          : `Probe latency ${formatOfficeOpsLatency(params.dbLatencyMs) ?? "normal"}`,
      periodDetail:
        databasePeriod !== "operational"
          ? "Elevated infra errors on recent days"
          : "Infra error history clean over 30 days",
    }),
    buildServiceCard({
      id: "notifications",
      name: "Notification service",
      description: "Email, SMS and WhatsApp delivery",
      currentStatus: notificationCurrent,
      periodStatus: notificationPeriod,
      uptimePct: uptimePctFromBars(notificationBars),
      latencyLabel: null,
      lastCheckedLabel: formatOfficeOpsRelativeTime(params.fetchedAt),
      uptimeBars: notificationBars,
      currentDetail: customerOutboundPaused
        ? "Customer outbound paused — email and SMS not sending"
        : whatsappPaused
          ? "WhatsApp temporarily paused"
          : currentNotificationAttempts > 0 && currentNotificationSuccessRate != null
            ? `${Math.round(currentNotificationSuccessRate)}% delivery success in the last hour`
            : "No delivery attempts in the last hour",
      periodDetail: customerOutboundPaused
        ? "Paused by ops — delivery metrics hidden while outbound is off"
        : notificationAttempts > 0 && notificationSuccessRate != null
          ? `${Math.round(notificationSuccessRate)}% delivery success over 30 days`
          : notificationPeriod !== "operational"
            ? `${uptimePctFromBars(notificationBars) ?? 0}% clean delivery days in 30d`
            : "Delivery history stable over 30 days",
    }),
  ];

  const healthyNow = services.filter((service) => service.currentStatus === "operational").length;
  const issuesNow = services.length - healthyNow;
  const healthy30d = services.filter((service) => service.periodStatus === "operational").length;
  const issues30d = services.length - healthy30d;
  const uptimeValues = services.map((service) => service.uptimePct).filter((value): value is number => value != null);
  const avgUptimePct =
    uptimeValues.length > 0 ? Math.round((uptimeValues.reduce((sum, value) => sum + value, 0) / uptimeValues.length) * 10) / 10 : null;

  const overallCurrentStatus = mergeOfficeOpsStatus(...services.map((service) => service.currentStatus));
  const overallPeriodStatus = mergeOfficeOpsStatus(...services.map((service) => service.periodStatus));
  const overallStatus = mergeOfficeOpsStatus(overallCurrentStatus, overallPeriodStatus);

  const serviceFindings = deriveServiceHealthFindings(services);
  const mergedHealth = mergeUnifiedHealthFindings({
    scanSummary: params.productionHealth,
    serviceFindings,
    fetchedAt: params.fetchedAt,
    scanLimit: params.productionHealth?.scanLimit ?? 0,
    scanDegraded: Boolean(params.productionHealthError),
    scanError: params.productionHealthError,
  });
  const unifiedStatus = evaluateUnifiedPlatformStatus(services, mergedHealth);
  const issueBreakdown = mergedHealth.totals;
  const consistencyValid = validateHealthConsistency({
    services,
    issuesNow,
    mergedSummary: mergedHealth,
    unifiedStatus,
  });

  const scannerStatus: OfficeOpsHealthSummary["scanner"]["status"] =
    unifiedStatus === "down" ? "down" : unifiedStatus;

  return {
    fetchedAt: params.fetchedAt,
    overallStatus,
    overallCurrentStatus,
    overallPeriodStatus,
    allOperational: overallStatus === "operational" && unifiedStatus === "healthy",
    allOperationalNow: overallCurrentStatus === "operational" && unifiedStatus === "healthy",
    services,
    kpis: {
      monitored: services.length,
      healthyNow,
      issuesNow,
      healthy30d,
      issues30d,
      avgUptimePct,
    },
    productionHealth: {
      status:
        unifiedStatus === "critical"
          ? "critical"
          : unifiedStatus === "healthy"
            ? "healthy"
            : "degraded",
      generatedAt: mergedHealth.generatedAt,
      scanLimit: mergedHealth.scanLimit,
      findings: mergedHealth.findings.map((finding) => ({
        code: finding.code,
        severity: finding.severity,
        count: finding.count,
        message: finding.message,
        sampleIds: finding.sampleIds,
      })),
      totals: mergedHealth.totals,
      totalFindings: mergedHealth.findings.reduce((sum, finding) => sum + finding.count, 0),
    },
    unified: {
      status: unifiedStatus,
      issueBreakdown,
      consistencyValid,
      statusDescription: unifiedStatusDescription(unifiedStatus),
    },
    scanner: {
      ok: true,
      status: scannerStatus,
      degraded: mergedHealth.degraded === true,
      ...(params.productionHealthError ? { error: params.productionHealthError } : {}),
      generatedAt: mergedHealth.generatedAt,
      lastScan: {
        source: "unified_ops_health",
        scanLimit: mergedHealth.scanLimit,
        metricsRecorded: false,
        degraded: mergedHealth.degraded === true,
      },
      counts: {
        ...mergedHealth.totals,
        totalFindings: mergedHealth.findings.reduce((sum, finding) => sum + finding.count, 0),
        acknowledgedHidden: 0,
      },
      summaries: mergedHealth.findings,
      acknowledgedSummaries: [],
      acknowledgements: [],
      sampleIds: Object.fromEntries(mergedHealth.findings.map((finding) => [finding.code, finding.sampleIds])),
    },
    ...(params.productionHealthError ? { error: params.productionHealthError } : {}),
  };
}

export const OFFICE_OPS_STATUS_CONFIG: Record<
  OfficeOpsServiceStatus,
  { label: string; dot: string; cls: string; bg: string }
> = {
  operational: { label: "Operational", dot: "bg-emerald-500", cls: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200" },
  degraded: { label: "Degraded", dot: "bg-orange-500", cls: "text-orange-700", bg: "bg-orange-50 border-orange-200" },
  down: { label: "Down", dot: "bg-red-500", cls: "text-red-700", bg: "bg-red-50 border-red-200" },
  maintenance: { label: "Maintenance", dot: "bg-blue-500", cls: "text-blue-700", bg: "bg-blue-50 border-blue-200" },
};

export const OFFICE_OPS_SERVICE_ICONS: Record<OfficeOpsServiceId, string> = {
  website: "globe",
  booking_engine: "zap",
  payment_gateway: "credit-card",
  database: "database",
  notifications: "bell",
};

export const OFFICE_OPS_UPTIME_BAR_CLASS: Record<OfficeOpsUptimeBar, string> = {
  ok: "bg-emerald-400",
  warn: "bg-orange-400",
  down: "bg-red-400",
};
