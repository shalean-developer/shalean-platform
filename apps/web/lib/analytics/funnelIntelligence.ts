export type InsightSeverity = "info" | "warning" | "critical";

export type InsightCategory =
  | "Funnel"
  | "Payments"
  | "Mobile UX"
  | "SEO"
  | "Operations"
  | "Availability"
  | "Experiments";

export type AnalyticsInsight = {
  id: string;
  severity: InsightSeverity;
  category: InsightCategory;
  title: string;
  detail: string;
};

export type FunnelAnomaly = {
  id: string;
  severity: InsightSeverity;
  metric: string;
  message: string;
  observed?: number;
  baseline?: number;
};

export type DailyTrendLite = {
  date: string;
  starts: number;
  completed: number;
  reachedPayment?: number;
};

export type FunnelIntelMetrics = {
  conversionRatePct: number;
  funnelStartSessions: number;
  reachedPaymentSessions: number;
  completedPaymentSessions?: number;
  paystackAbandonmentPct: number;
  paystackOpened: number;
  paystackCompleted: number;
  dropOffByStep: { step: string; viewed: number; dropped: number; dropOffPct: number }[];
  errorsByStep: { step: string; count: number }[];
  dailyTrends: DailyTrendLite[];
  mobileUxHint?: { starts: number; completed: number; conversionPct: number; label: string };
};

function pct(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((part / total) * 1000) / 10;
}

/** Scale volume thresholds down for low-traffic windows so cards stay useful. */
function volumeFloor(m: FunnelIntelMetrics, base: number): number {
  if (m.funnelStartSessions >= 100) return base;
  if (m.funnelStartSessions >= 30) return Math.max(3, Math.round(base * 0.6));
  return Math.max(2, Math.round(base * 0.35));
}

export function generateAnalyticsInsights(m: FunnelIntelMetrics): AnalyticsInsight[] {
  const out: AnalyticsInsight[] = [];

  const worstDrop = [...m.dropOffByStep].sort((a, b) => b.dropOffPct - a.dropOffPct)[0];
  const dropViewFloor = volumeFloor(m, 5);
  const dropPctFloor = m.funnelStartSessions < 30 ? 15 : 35;
  if (worstDrop && worstDrop.viewed >= dropViewFloor && worstDrop.dropOffPct >= dropPctFloor) {
    out.push({
      id: "funnel_step_dropoff",
      severity: worstDrop.dropOffPct >= 55 ? "critical" : "warning",
      category: "Funnel",
      title: `Largest leak: ${worstDrop.step} → next`,
      detail: `${worstDrop.dropOffPct.toFixed(1)}% of sessions that viewed ${worstDrop.step} never progressed (${worstDrop.dropped}/${worstDrop.viewed}).`,
    });
  }

  if (m.paystackOpened >= volumeFloor(m, 10) && m.paystackAbandonmentPct >= (m.funnelStartSessions < 30 ? 25 : 40)) {
    out.push({
      id: "paystack_abandon",
      severity: m.paystackAbandonmentPct >= 60 ? "critical" : "warning",
      category: "Payments",
      title: "Checkout abandonment is elevated",
      detail: `${m.paystackAbandonmentPct.toFixed(1)}% of Paystack opens did not complete (${m.paystackCompleted}/${m.paystackOpened}).`,
    });
  }

  const paid = m.completedPaymentSessions ?? m.paystackCompleted;
  const checkoutFloor = volumeFloor(m, 5);
  const checkoutDropFloor = m.funnelStartSessions < 30 ? 10 : 15;
  if (m.reachedPaymentSessions >= checkoutFloor && paid < m.reachedPaymentSessions) {
    const dropPct = pct(m.reachedPaymentSessions - paid, m.reachedPaymentSessions);
    if (dropPct >= checkoutDropFloor) {
      out.push({
        id: "payment_completion_dropoff",
        severity: dropPct >= 30 ? "warning" : "info",
        category: "Payments",
        title: "Checkout-to-paid drop-off",
        detail: `${dropPct.toFixed(1)}% of sessions that reached checkout did not complete payment (${paid}/${m.reachedPaymentSessions}).`,
      });
    }
  }

  const errTotal = m.errorsByStep.reduce((s, r) => s + r.count, 0);
  if (errTotal >= volumeFloor(m, 15)) {
    const top = [...m.errorsByStep].sort((a, b) => b.count - a.count)[0];
    out.push({
      id: "booking_errors",
      severity: errTotal >= 50 ? "critical" : "warning",
      category: "Operations",
      title: "Booking flow errors spiking",
      detail: top
        ? `${errTotal} errors in-window; busiest step: ${top.step} (${top.count}).`
        : `${errTotal} errors recorded in-window.`,
    });
  }

  if (m.mobileUxHint && m.mobileUxHint.starts >= volumeFloor(m, 20) && m.mobileUxHint.conversionPct <= 12) {
    out.push({
      id: "mobile_conversion_soft",
      severity: "info",
      category: "Mobile UX",
      title: `Mobile (${m.mobileUxHint.label}) converts below desktop-tier`,
      detail: `${m.mobileUxHint.conversionPct.toFixed(1)}% completion on ${m.mobileUxHint.starts} mobile-class sessions — review slot picker and payment friction.`,
    });
  }

  if (out.length === 0 && m.funnelStartSessions >= volumeFloor(m, 10)) {
    out.push({
      id: "healthy_baseline",
      severity: "info",
      category: "Funnel",
      title: "No acute funnel regressions detected",
      detail:
        paid > 0 && m.reachedPaymentSessions > paid
          ? `${paid}/${m.reachedPaymentSessions} checkout sessions completed payment; quote-to-checkout reach is ${m.conversionRatePct.toFixed(1)}%.`
          : `Overall checkout reach from quote starts is ${m.conversionRatePct.toFixed(1)}% with ${m.funnelStartSessions} starters in-window.`,
    });
  }

  return out.slice(0, 12);
}

export function detectFunnelAnomalies(m: FunnelIntelMetrics): FunnelAnomaly[] {
  const anomalies: FunnelAnomaly[] = [];
  const trends = m.dailyTrends.filter((d) => d.starts > 0);
  const trendDaysRequired = m.funnelStartSessions < 30 ? 6 : 10;
  if (trends.length >= trendDaysRequired) {
    const mid = Math.floor(trends.length / 2);
    const recent = trends.slice(mid);
    const prior = trends.slice(0, mid);
    const recentRate =
      recent.reduce((s, d) => s + pct(d.completed, d.starts), 0) / Math.max(recent.length, 1);
    const priorRate =
      prior.reduce((s, d) => s + pct(d.completed, d.starts), 0) / Math.max(prior.length, 1);
    if (priorRate > 5 && recentRate < priorRate * 0.85) {
      anomalies.push({
        id: "completion_rate_drop",
        severity: recentRate < priorRate * 0.65 ? "critical" : "warning",
        metric: "booking_completed / starts",
        message: `Completion rate fell ~${(priorRate - recentRate).toFixed(1)} pts vs earlier window.`,
        observed: recentRate,
        baseline: priorRate,
      });
    }
  }

  const paid = m.completedPaymentSessions ?? m.paystackCompleted;
  if (m.reachedPaymentSessions >= volumeFloor(m, 5) && paid < m.reachedPaymentSessions) {
    const checkoutDropPct = pct(m.reachedPaymentSessions - paid, m.reachedPaymentSessions);
    if (checkoutDropPct >= (m.funnelStartSessions < 30 ? 12 : 20)) {
      anomalies.push({
        id: "checkout_to_paid_drop",
        severity: checkoutDropPct >= 30 ? "warning" : "info",
        metric: "checkout_to_paid_pct",
        message: `${checkoutDropPct.toFixed(1)}% of checkout sessions did not complete payment.`,
        observed: checkoutDropPct,
        baseline: 10,
      });
    }
  }

  const worstDrop = [...m.dropOffByStep].sort((a, b) => b.dropOffPct - a.dropOffPct)[0];
  if (
    worstDrop &&
    worstDrop.viewed >= volumeFloor(m, 4) &&
    worstDrop.dropOffPct >= (m.funnelStartSessions < 30 ? 12 : 25)
  ) {
    anomalies.push({
      id: "step_dropoff_elevated",
      severity: worstDrop.dropOffPct >= 40 ? "warning" : "info",
      metric: `dropoff_${worstDrop.step}`,
      message: `Elevated drop-off after ${worstDrop.step} (${worstDrop.dropOffPct.toFixed(1)}%).`,
      observed: worstDrop.dropOffPct,
      baseline: 15,
    });
  }

  if (m.paystackOpened >= volumeFloor(m, 8) && m.paystackAbandonmentPct >= (m.funnelStartSessions < 30 ? 35 : 55)) {
    anomalies.push({
      id: "paystack_failure_spike",
      severity: "critical",
      metric: "paystack_abandonment_pct",
      message: "Paystack abandonment exceeds 55%.",
      observed: m.paystackAbandonmentPct,
      baseline: 35,
    });
  }

  const errTotal = m.errorsByStep.reduce((s, r) => s + r.count, 0);
  if (errTotal >= volumeFloor(m, 30)) {
    anomalies.push({
      id: "error_volume",
      severity: "warning",
      metric: "booking_events.error",
      message: `High volume of booking_errors (${errTotal}) — verify APIs and validation.`,
      observed: errTotal,
    });
  }

  return anomalies;
}
