import type { AnalyticsInsight } from "@/lib/analytics/funnelIntelligence";
import type { FunnelAnomaly } from "@/lib/analytics/funnelIntelligence";

export type FunnelNarrativeInput = {
  conversionRatePct: number;
  funnelStartSessions: number;
  reachedPaymentSessions?: number;
  completedPaymentSessions?: number;
  paidBookingsCount?: number;
  insights: AnalyticsInsight[];
  anomalies: FunnelAnomaly[];
};

/**
 * Short executive-style paragraph for admin surfaces (not a substitute for charts).
 */
export function buildFunnelNarrativeSummary(input: FunnelNarrativeInput): string {
  const parts: string[] = [];
  const checkoutReached = input.reachedPaymentSessions ?? 0;
  const paid = input.completedPaymentSessions ?? input.paidBookingsCount ?? 0;

  if (input.funnelStartSessions <= 0 && checkoutReached <= 0 && paid > 0) {
    parts.push(
      `${paid} paid booking(s) recorded with limited service-and-price funnel events — step drop-off charts may under-report until booking_events views accumulate.`,
    );
  } else if (checkoutReached > 0 && paid > 0 && paid < checkoutReached) {
    const paidPct = Math.round((paid / checkoutReached) * 1000) / 10;
    parts.push(
      `${checkoutReached} sessions reached checkout; ${paid} completed payment (${paidPct}%). Service-and-price to checkout reach is ${input.conversionRatePct.toFixed(1)}% across ${input.funnelStartSessions} starters.`,
    );
  } else {
    parts.push(
      `Roughly ${input.conversionRatePct.toFixed(1)}% of service-and-price sessions reached checkout, across ${input.funnelStartSessions} starters in this window.`,
    );
  }

  const critical = input.anomalies.filter((a) => a.severity === "critical");
  const warns = input.anomalies.filter((a) => a.severity === "warning");
  if (critical.length > 0) {
    parts.push(`Critical signals: ${critical.map((a) => a.message).join(" ")}`);
  } else if (warns.length > 0) {
    parts.push(`Watch items: ${warns.slice(0, 2).map((w) => w.message).join(" ")}`);
  }

  const topInsight = input.insights.find((i) => i.severity === "warning" || i.severity === "critical");
  const infoInsight = input.insights.find((i) => i.severity === "info");
  if (topInsight) {
    parts.push(`${topInsight.title} — ${topInsight.detail}`);
  } else if (infoInsight) {
    parts.push(`${infoInsight.title}: ${infoInsight.detail}`);
  }

  return parts.join(" ");
}