import type { AnalyticsInsight } from "@/lib/analytics/funnelIntelligence";
import type { FunnelAnomaly } from "@/lib/analytics/funnelIntelligence";

export type FunnelNarrativeInput = {
  conversionRatePct: number;
  funnelStartSessions: number;
  insights: AnalyticsInsight[];
  anomalies: FunnelAnomaly[];
};

/**
 * Short executive-style paragraph for admin surfaces (not a substitute for charts).
 */
export function buildFunnelNarrativeSummary(input: FunnelNarrativeInput): string {
  const parts: string[] = [];
  parts.push(
    `Roughly ${input.conversionRatePct.toFixed(1)}% of quote-stage sessions reached checkout (payment step), across ${input.funnelStartSessions} starters in this window.`,
  );

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
