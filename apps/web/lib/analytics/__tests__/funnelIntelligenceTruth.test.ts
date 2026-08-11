import { describe, expect, it } from "vitest";
import { generateAnalyticsInsights, type FunnelIntelMetrics } from "@/lib/analytics/funnelIntelligence";

function metrics(overrides: Partial<FunnelIntelMetrics> = {}): FunnelIntelMetrics {
  return {
    conversionRatePct: 45,
    funnelStartSessions: 100,
    reachedPaymentSessions: 45,
    completedPaymentSessions: 35,
    paystackAbandonmentPct: 10,
    paystackOpened: 20,
    paystackCompleted: 18,
    dropOffByStep: [],
    errorsByStep: [],
    dailyTrends: [],
    ...overrides,
  };
}

describe("Funnel Intelligence truth model", () => {
  it("uses customer-facing stage names instead of the legacy quote label", () => {
    const insights = generateAnalyticsInsights(
      metrics({
        dropOffByStep: [{ step: "quote", viewed: 100, dropped: 60, dropOffPct: 60 }],
      }),
    );

    expect(insights[0]?.title).toContain("Service & price");
    expect(insights[0]?.title).not.toContain("quote");
  });

  it("treats repeated validation attempts as one affected customer session for severity", () => {
    const insights = generateAnalyticsInsights(
      metrics({
        errorsByStep: [
          {
            step: "quote",
            count: 18,
            affectedSessions: 18,
            eventCount: 94,
            validationAttempts: 94,
            technicalErrors: 0,
          },
        ],
      }),
    );

    const errorInsight = insights.find((row) => row.id === "booking_errors");
    expect(errorInsight?.detail).toContain("18 affected customer sessions");
    expect(errorInsight?.detail).toContain("94 validation attempts");
    expect(errorInsight?.detail).not.toContain("94 errors");
  });
});