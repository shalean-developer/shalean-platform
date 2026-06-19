import { describe, expect, it } from "vitest";
import {
  buildOfficeFunnelKpis,
  buildOfficeFunnelRecommendations,
  buildOfficeFunnelSteps,
  buildOfficeProductFlowSteps,
  dailyTrendMax,
  overallFunnelConversionPct,
  paymentCompletedCount,
  sliceDailyTrends,
  type BookingFunnelApiPayload,
} from "@/lib/admin/officeFunnelPresentation";

const SAMPLE: BookingFunnelApiPayload = {
  since: "2026-05-20T00:00:00.000Z",
  sessions: 420,
  sessionsWithFunnelView: 310,
  funnelStartSessions: 180,
  reachedPaymentSessions: 72,
  completedPaymentSessions: 48,
  analyticsCompletedSessions: 0,
  paidBookingsCount: 48,
  conversionRatePct: 40,
  narrativeSummary: "Checkout reach is stable.",
  viewsByStep: [
    { step: "entry", views: 300 },
    { step: "quote", views: 180 },
    { step: "payment", views: 72 },
  ],
  insights: [
    {
      id: "funnel_step_dropoff",
      severity: "warning",
      category: "Funnel",
      title: "Largest leak: quote → next",
      detail: "45% drop-off at quote.",
    },
  ],
  anomalies: [
    {
      id: "conv_drop",
      severity: "critical",
      metric: "conversion_rate",
      message: "Conversion dipped vs baseline",
      observed: 8,
      baseline: 14,
    },
  ],
  intelligence: {
    timeToComplete: { completedSessions: 48, avgSeconds: 420, medianSeconds: 360 },
    paystack: { opened: 60, completed: 48, abandonmentPct: 20 },
    revenue: { paidBookings: 45, totalZar: 54000 },
    dailyTrends: [
      { date: "2026-06-01", starts: 5, reachedPayment: 2, completed: 1, bookings: 1, paystackAbandons: 0, conversionPct: 20, paymentReachPct: 40 },
      { date: "2026-06-02", starts: 8, reachedPayment: 4, completed: 3, bookings: 3, paystackAbandons: 1, conversionPct: 37.5, paymentReachPct: 50 },
    ],
    stepConversion: [
      { from: "quote", to: "extras", viewed: 100, progressed: 70, conversionPct: 70, dropOffPct: 30 },
    ],
    deviceBreakdown: [{ label: "Mobile", starts: 80, reachedPayment: 30, completed: 20, conversionPct: 25 }],
    addOnAttachRatePct: 34.5,
    cleanerSelectionRatePct: 12,
  },
};

describe("buildOfficeFunnelSteps", () => {
  it("maps API funnel counts into four office UI steps with drop-off", () => {
    const steps = buildOfficeFunnelSteps(SAMPLE);
    expect(steps.map((s) => s.value)).toEqual([310, 180, 72, 48]);
    expect(steps[1]?.dropoff).toBe(130);
  });
});

describe("paymentCompletedCount", () => {
  it("prefers unified count and falls back to paid bookings when analytics is zero", () => {
    expect(paymentCompletedCount(SAMPLE)).toBe(48);
    expect(
      paymentCompletedCount({
        sessionsWithFunnelView: 320,
        reachedPaymentSessions: 42,
        analyticsCompletedSessions: 0,
        intelligence: {
          timeToComplete: { completedSessions: 0 },
          paystack: { completed: 0 },
          revenue: { paidBookings: 38 },
        },
      }),
    ).toBe(38);
  });
});

describe("buildOfficeProductFlowSteps", () => {
  it("returns ordered product flow tiles with view counts", () => {
    const flow = buildOfficeProductFlowSteps(SAMPLE);
    expect(flow.find((s) => s.key === "entry")?.views).toBe(300);
    expect(flow.find((s) => s.key === "payment")?.views).toBe(72);
  });
});

describe("buildOfficeFunnelKpis", () => {
  it("builds four KPI cards from intelligence payload", () => {
    const kpis = buildOfficeFunnelKpis(SAMPLE);
    expect(kpis).toHaveLength(4);
    expect(kpis[0]?.value).toBe("15.5%");
    expect(kpis[1]?.value).toBe("40.0%");
    expect(kpis[3]?.value).toBe("20.0%");
  });
});

describe("sliceDailyTrends", () => {
  it("returns trailing slice of daily trends", () => {
    expect(sliceDailyTrends(SAMPLE, 1)).toHaveLength(1);
    expect(dailyTrendMax(sliceDailyTrends(SAMPLE))).toBe(8);
  });
});

describe("overallFunnelConversionPct", () => {
  it("uses visitors to completed payment sessions", () => {
    expect(overallFunnelConversionPct(SAMPLE)).toBeCloseTo(15.5, 1);
  });
});

describe("buildOfficeFunnelRecommendations", () => {
  it("merges insights and anomalies with severity-based priority", () => {
    const rows = buildOfficeFunnelRecommendations(SAMPLE);
    expect(rows).toHaveLength(2);
    expect(rows[1]?.priority).toBe("high");
  });
});
