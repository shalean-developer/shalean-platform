export type BookingFunnelInsight = {
  id: string;
  severity: "info" | "warning" | "critical" | string;
  category: string;
  title: string;
  detail: string;
};

export type BookingFunnelAnomaly = {
  id: string;
  severity: "info" | "warning" | "critical" | string;
  metric: string;
  message: string;
  observed?: number;
  baseline?: number;
};

export type FunnelSegmentRow = {
  label: string;
  starts: number;
  reachedPayment: number;
  completed: number;
  conversionPct: number;
  addOnAttachPct?: number;
};

export type FunnelDailyTrendRow = {
  date: string;
  starts: number;
  reachedPayment: number;
  completed: number;
  bookings: number;
  paystackAbandons: number;
  conversionPct: number;
  paymentReachPct: number;
};

export type FunnelStepConversionRow = {
  from: string;
  to: string;
  viewed: number;
  progressed: number;
  conversionPct: number;
  dropOffPct: number;
};

export type FunnelErrorRow = {
  step: string;
  /** Distinct customer sessions affected. Kept as `count` for backward compatibility. */
  count: number;
  affectedSessions?: number;
  eventCount?: number;
  validationAttempts?: number;
  technicalErrors?: number;
  topFields?: Array<{ field: string; count: number }>;
};

export type BookingFunnelApiPayload = {
  since?: string;
  rows?: number;
  sessions?: number;
  sessionsWithFunnelView?: number;
  funnelStartSessions?: number;
  reachedPaymentSessions?: number;
  completedPaymentSessions?: number;
  analyticsCompletedSessions?: number;
  paidBookingsCount?: number;
  conversionRatePct?: number;
  narrativeSummary?: string | null;
  message?: string | null;
  insights?: BookingFunnelInsight[];
  anomalies?: BookingFunnelAnomaly[];
  dropOffByStep?: Array<{ step: string; viewed: number; dropped: number; dropOffPct: number }>;
  viewsByStep?: Array<{ step: string; views: number }>;
  topExitSteps?: Array<{ step: string; count: number }>;
  errorsByStep?: FunnelErrorRow[];
  intelligence?: {
    stepConversion?: FunnelStepConversionRow[];
    timeToComplete?: {
      completedSessions?: number;
      avgSeconds?: number | null;
      medianSeconds?: number | null;
    };
    deviceBreakdown?: FunnelSegmentRow[];
    serviceBreakdown?: FunnelSegmentRow[];
    areaBreakdown?: FunnelSegmentRow[];
    cleanerSelectionRatePct?: number;
    addOnAttachRatePct?: number;
    paystack?: { opened?: number; completed?: number; abandonmentPct?: number };
    dailyTrends?: FunnelDailyTrendRow[];
    revenue?: { paidBookings?: number; totalZar?: number; recordedTotalZar?: number; excludedFixtureZar?: number };
  };
};

export type OfficeFunnelStep = {
  step: number;
  label: string;
  value: number;
  pct: number;
  dropoff: number | null;
  dropoffPct: number | null;
  color: string;
};

export type OfficeFunnelRecommendation = {
  id: string;
  priority: "high" | "medium" | "low";
  title: string;
  description: string;
  category?: string;
  kind: "insight" | "anomaly";
};

export type OfficeFunnelKpi = {
  label: string;
  value: string;
  sub: string;
  tone: "blue" | "emerald" | "violet" | "orange";
};

export type OfficeProductFlowStep = {
  key: string;
  label: string;
  views: number;
  sub?: string;
};

/**
 * Business-facing labels for the canonical booking-v2 journey.
 * Legacy DB step keys are intentionally preserved so historical telemetry remains readable.
 */
export const OFFICE_FUNNEL_STEP_LABELS: Record<string, string> = {
  entry: "Booking",
  quote: "Service",
  extras: "Service",
  datetime: "Schedule",
  details: "Details",
  payment: "Checkout",
  paid: "Paid",
};

const STEP_COLORS = [
  "bg-blue-500",
  "bg-blue-400",
  "bg-violet-400",
  "bg-violet-300",
  "bg-emerald-400",
  "bg-emerald-500",
] as const;
const PRODUCT_FLOW_ORDER = ["entry", "quote", "datetime", "details", "payment", "paid"] as const;

function pct(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((part / total) * 1000) / 10;
}

export function pctLabel(value: number | null | undefined): string {
  return value == null || Number.isNaN(value) ? "—" : `${value.toFixed(1)}%`;
}

export function zarLabel(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `R ${Math.round(value).toLocaleString("en-ZA")}`;
}

export function formatFunnelDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return "—";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.round((minutes / 60) * 10) / 10}h`;
}

export function funnelStepLabel(step: string): string {
  return OFFICE_FUNNEL_STEP_LABELS[step] ?? step.replace(/[_-]+/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

export type PaymentCompletedSource = "unified" | "analytics" | "paystack" | "bookings" | "none";

export function paymentCompletedCount(data: BookingFunnelApiPayload): number {
  if (typeof data.completedPaymentSessions === "number" && data.completedPaymentSessions > 0) {
    return data.completedPaymentSessions;
  }

  // Never substitute uncorrelated DB booking counts for session conversion.
  const analytics = data.analyticsCompletedSessions ?? data.intelligence?.timeToComplete?.completedSessions ?? 0;
  const paystack = data.intelligence?.paystack?.completed ?? 0;
  return Math.max(analytics, paystack);
}

export function paymentCompletedSource(data: BookingFunnelApiPayload): PaymentCompletedSource {
  const count = paymentCompletedCount(data);
  if (count <= 0) return "none";
  if (typeof data.completedPaymentSessions === "number" && data.completedPaymentSessions > 0) return "unified";
  const analytics = data.analyticsCompletedSessions ?? data.intelligence?.timeToComplete?.completedSessions ?? 0;
  const paystack = data.intelligence?.paystack?.completed ?? 0;
  // Paid booking rows have no guaranteed one-to-one correlation with browser sessions.
  if (paystack >= count && paystack > 0) return "paystack";
  if (analytics >= count && analytics > 0) return "analytics";
  return "unified";
}

export function paymentCompletedSourceLabel(source: PaymentCompletedSource): string {
  switch (source) {
    case "bookings":
      return "Booking records";
    case "paystack":
      return "Payment sessions";
    case "analytics":
      return "Recorded payments";
    case "unified":
      return "Recorded payments";
    default:
      return "No payments recorded";
  }
}

export function funnelVisitorCount(data: BookingFunnelApiPayload): number {
  const fromFunnelViews = Math.max(data.sessionsWithFunnelView ?? 0, data.funnelStartSessions ?? 0);
  if (fromFunnelViews > 0) return fromFunnelViews;
  return data.sessions ?? 0;
}

export function overallFunnelConversionPct(data: BookingFunnelApiPayload): number | null {
  const visitors = funnelVisitorCount(data);
  const completed = paymentCompletedCount(data);
  if (visitors <= 0) return null;
  return pct(completed, visitors);
}

export function checkoutToPaidConversionPct(data: BookingFunnelApiPayload): number | null {
  const checkout = data.reachedPaymentSessions ?? 0;
  const paid = paymentCompletedCount(data);
  if (checkout <= 0) return null;
  return pct(paid, checkout);
}

export function buildOfficeFunnelSteps(data: BookingFunnelApiPayload): OfficeFunnelStep[] {
  const views = new Map((data.viewsByStep ?? []).map((row) => [row.step, row.views]));
  const booking = Math.max(views.get("entry") ?? 0, funnelVisitorCount(data));
  const service = views.get("quote") ?? 0;
  const schedule = views.get("datetime") ?? 0;
  const details = views.get("details") ?? 0;
  const checkout = Math.max(views.get("payment") ?? 0, data.reachedPaymentSessions ?? 0);
  const paid = paymentCompletedCount(data);

  const values = [
    { label: "Booking", value: booking },
    { label: "Service", value: service },
    { label: "Schedule", value: schedule },
    { label: "Details", value: details },
    { label: "Checkout", value: checkout },
    { label: "Paid", value: paid },
  ];

  const top = Math.max(booking, 1);

  return values.map((row, index) => {
    const prev = index > 0 ? values[index - 1]!.value : null;
    const rawDropoff = prev != null ? prev - row.value : null;
    const dropoff = rawDropoff != null ? Math.max(0, rawDropoff) : null;
    const dropoffPct =
      prev != null && prev > 0 && dropoff != null && dropoff > 0 ? pct(dropoff, prev) : dropoff === 0 ? 0 : null;
    return {
      step: index + 1,
      label: row.label,
      value: row.value,
      pct: pct(row.value, top),
      dropoff,
      dropoffPct,
      color: STEP_COLORS[index] ?? STEP_COLORS[0]!,
    };
  });
}

export function hasSparseFunnelTracking(data: BookingFunnelApiPayload): boolean {
  const bookingEventRows = data.rows ?? 0;
  const hasInferredFunnel = (data.funnelStartSessions ?? 0) > 0 && bookingEventRows < 10;
  return hasInferredFunnel && bookingEventRows < (data.sessions ?? 0);
}

export function buildOfficeProductFlowSteps(data: BookingFunnelApiPayload): OfficeProductFlowStep[] {
  const views = new Map((data.viewsByStep ?? []).map((row) => [row.step, row.views]));
  const paid = paymentCompletedCount(data);
  return PRODUCT_FLOW_ORDER.map((key) => ({
    key,
    label: funnelStepLabel(key),
    views: key === "paid" ? paid : (views.get(key) ?? 0),
    sub: key === "payment" && paid > 0 ? `${paid} paid` : undefined,
  }));
}

export function buildOfficeFunnelKpis(data: BookingFunnelApiPayload): OfficeFunnelKpi[] {
  const overall = overallFunnelConversionPct(data);
  const checkoutPaid = checkoutToPaidConversionPct(data);
  const paystack = data.intelligence?.paystack;
  const time = data.intelligence?.timeToComplete;
  const checkout = data.reachedPaymentSessions ?? 0;
  const paid = paymentCompletedCount(data);

  return [
    {
      label: "Booking → paid",
      value: overall != null ? `${overall}%` : "—",
      sub: `${paid} paid · ${funnelVisitorCount(data)} booking sessions`,
      tone: "emerald",
    },
    {
      label: "Checkout → paid",
      value: pctLabel(checkoutPaid),
      sub: `${paid} paid · ${checkout} at checkout`,
      tone: "blue",
    },
    {
      label: "Median booking time",
      value: formatFunnelDuration(time?.medianSeconds),
      sub: `${time?.completedSessions ?? 0} completed bookings`,
      tone: "violet",
    },
    {
      label: "Payment drop-off",
      value: pctLabel(paystack?.abandonmentPct),
      sub: `${paystack?.completed ?? 0}/${paystack?.opened ?? 0} payment sessions`,
      tone: "orange",
    },
  ];
}

export type OfficeFunnelRevenueMetric = { label: string; value: string };

/** Display existing API totals without implying settlement or Paystack verification. */
export function buildOfficeFunnelRevenueMetrics(data: BookingFunnelApiPayload): OfficeFunnelRevenueMetric[] | null {
  const revenue = data.intelligence?.revenue;
  if (!revenue) return null;
  return [
    { label: "Recorded booking revenue", value: zarLabel(revenue.totalZar) },
    { label: "Excluded non-live records", value: zarLabel(revenue.excludedFixtureZar) },
    { label: "Total before exclusions", value: zarLabel(revenue.recordedTotalZar) },
  ];
}

function severityToPriority(severity: string): OfficeFunnelRecommendation["priority"] {
  if (severity === "critical") return "high";
  if (severity === "warning") return "medium";
  return "low";
}

export function buildOfficeFunnelInsights(data: BookingFunnelApiPayload): OfficeFunnelRecommendation[] {
  return (data.insights ?? []).map((row) => ({
    id: row.id,
    priority: severityToPriority(row.severity),
    title: row.title,
    description: row.detail,
    category: row.category,
    kind: "insight" as const,
  }));
}

export function buildOfficeFunnelAnomalies(data: BookingFunnelApiPayload): OfficeFunnelRecommendation[] {
  return (data.anomalies ?? []).map((row) => ({
    id: `anomaly-${row.id}`,
    priority: severityToPriority(row.severity),
    title: row.message,
    description:
      row.observed != null
        ? `Current ${Number(row.observed.toFixed(1))}${row.baseline != null ? ` · Reference ${Number(row.baseline.toFixed(1))}` : ""}`
        : "Requires review",
    category: "Anomaly",
    kind: "anomaly" as const,
  }));
}

/** @deprecated Use buildOfficeFunnelInsights + buildOfficeFunnelAnomalies */
export function buildOfficeFunnelRecommendations(data: BookingFunnelApiPayload): OfficeFunnelRecommendation[] {
  return [...buildOfficeFunnelInsights(data), ...buildOfficeFunnelAnomalies(data)].slice(0, 12);
}

export function buildOfficeFunnelSummaryLine(data: BookingFunnelApiPayload): string | null {
  const checkout = data.reachedPaymentSessions ?? 0;
  const paid = paymentCompletedCount(data);
  const transitions = data.intelligence?.stepConversion ?? [];
  const biggestDrop = transitions
    .filter((row) => row.viewed > 0 && row.dropOffPct > 0)
    .reduce<FunnelStepConversionRow | null>(
      (largest, row) => !largest || row.dropOffPct > largest.dropOffPct ? row : largest,
      null,
    );
  if (checkout <= 0 && paid <= 0 && !biggestDrop) return null;
  const conversion = checkout > 0 ? ` (${pctLabel(pct(paid, checkout))})` : "";
  const summary = `${checkout} reached checkout · ${paid} paid${conversion}.`;
  return biggestDrop
    ? `${summary} Biggest drop-off: ${funnelStepLabel(biggestDrop.from)} → ${funnelStepLabel(biggestDrop.to)} (${pctLabel(biggestDrop.dropOffPct)}).`
    : summary;
}

export function sliceDailyTrends(data: BookingFunnelApiPayload, days = 14): FunnelDailyTrendRow[] {
  const rows = data.intelligence?.dailyTrends ?? [];
  return rows.slice(Math.max(0, rows.length - days));
}

export function dailyTrendMax(rows: FunnelDailyTrendRow[]): number {
  const values = rows.flatMap((d) => [d.starts, d.completed, d.paystackAbandons]);
  return values.length ? Math.max(...values, 1) : 1;
}

/** Presentation-only chart geometry. Empty days must not render as activity. */
export function dailyTrendBarHeights(
  day: Pick<FunnelDailyTrendRow, "starts" | "completed" | "paystackAbandons">,
  max: number,
): { barHeight: number; completedHeight: number; abandonsHeight: number } {
  const scale = Math.max(max, 1);
  const activity = Math.max(day.starts, day.completed, day.paystackAbandons);
  return {
    barHeight: activity > 0 ? Math.max(4, (activity / scale) * 120) : 0,
    completedHeight: Math.max(0, (day.completed / scale) * 120),
    abandonsHeight: Math.max(0, (day.paystackAbandons / scale) * 120),
  };
}

export function hasFunnelActivity(data: BookingFunnelApiPayload): boolean {
  return (
    funnelVisitorCount(data) > 0 ||
    (data.funnelStartSessions ?? 0) > 0 ||
    (data.sessions ?? 0) > 0 ||
    (data.rows ?? 0) > 0
  );
}