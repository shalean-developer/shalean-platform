import { describe, expect, it } from "vitest";
import {
  buildOfficeFunnelKpis,
  buildOfficeFunnelRevenueMetrics,
  buildOfficeFunnelRecommendations,
  buildOfficeFunnelSteps,
  buildOfficeProductFlowSteps,
  dailyTrendBarHeights,
  dailyTrendMax,
  funnelStepLabel,
  funnelVisitorCount,
  overallFunnelConversionPct,
  paymentCompletedCount,
  zarLabel,
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
    { step: "datetime", views: 130 },
    { step: "details", views: 100 },
    { step: "payment", views: 72 },
  ],
  errorsByStep: [
    {
      step: "quote",
      count: 18,
      affectedSessions: 18,
      eventCount: 94,
      validationAttempts: 94,
      technicalErrors: 0,
      topFields: [{ field: "serviceDetails.bathrooms", count: 31 }],
    },
  ],
  insights: [
    {
      id: "funnel_step_dropoff",
      severity: "warning",
      category: "Funnel",
      title: "Largest leak: Service → next",
      detail: "45% drop-off at Service.",
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
      { from: "quote", to: "datetime", viewed: 100, progressed: 70, conversionPct: 70, dropOffPct: 30 },
    ],
    deviceBreakdown: [{ label: "Mobile", starts: 80, reachedPayment: 30, completed: 20, conversionPct: 25 }],
    addOnAttachRatePct: 34.5,
    cleanerSelectionRatePct: 12,
  },
};

describe("buildOfficeFunnelSteps", () => {
  it("maps API funnel counts into the exact six-stage business funnel", () => {
    const steps = buildOfficeFunnelSteps(SAMPLE);
    expect(steps.map((s) => s.label)).toEqual([
      "Booking",
      "Service",
      "Schedule",
      "Details",
      "Checkout",
      "Paid",
    ]);
    expect(steps.map((s) => s.value)).toEqual([310, 180, 130, 100, 72, 48]);
    expect(steps[1]?.dropoff).toBe(130);
  });
});

describe("paymentCompletedCount", () => {
  it("prefers unified count and never treats uncorrelated booking rows as completed browser sessions", () => {
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
    ).toBe(0);
  });
});

describe("service view consistency", () => {
  it("keeps the main Service count aligned with observed Product Flow views", () => {
    const example = { ...SAMPLE, funnelStartSessions: 184 };
    expect(buildOfficeFunnelSteps(example)[1]?.value).toBe(180);
    expect(buildOfficeProductFlowSteps(example)[1]?.views).toBe(180);
  });
});

describe("buildOfficeProductFlowSteps", () => {
  it("returns Booking → Service → Schedule → Details → Checkout → Paid", () => {
    const flow = buildOfficeProductFlowSteps(SAMPLE);
    expect(flow.map((s) => s.label)).toEqual([
      "Booking",
      "Service",
      "Schedule",
      "Details",
      "Checkout",
      "Paid",
    ]);
    expect(flow.find((s) => s.key === "entry")?.views).toBe(300);
    expect(flow.find((s) => s.key === "details")?.views).toBe(100);
    expect(flow.find((s) => s.key === "payment")?.views).toBe(72);
    expect(flow.find((s) => s.key === "paid")?.views).toBe(48);
    expect(flow.find((s) => s.key === "payment")?.sub).toBe("48 paid");
  });
});

describe("funnelStepLabel", () => {
  it("keeps legacy analytics keys compatible while using exact business labels", () => {
    expect(funnelStepLabel("entry")).toBe("Booking");
    expect(funnelStepLabel("quote")).toBe("Service");
    expect(funnelStepLabel("extras")).toBe("Service");
    expect(funnelStepLabel("datetime")).toBe("Schedule");
    expect(funnelStepLabel("details")).toBe("Details");
    expect(funnelStepLabel("payment")).toBe("Checkout");
    expect(funnelStepLabel("paid")).toBe("Paid");
  });
});

describe("buildOfficeFunnelKpis", () => {
  it("keeps Paystack KPI focused on payment sessions without burying revenue", () => {
    const cards = buildOfficeFunnelKpis({
      ...SAMPLE,
      intelligence: { ...SAMPLE.intelligence, revenue: {
        paidBookings: 7, totalZar: 3685, recordedTotalZar: 4545, excludedFixtureZar: 860,
      } },
    });
    expect(cards).toHaveLength(4);
    expect(cards[3]?.sub).toBe("48/60 Paystack sessions");
    expect(cards[3]?.sub).not.toContain("3 685");
  });

  it("shows the exact non-fixture, excluded and historical figures in a separate revenue model", () => {
    const metrics = buildOfficeFunnelRevenueMetrics({
      ...SAMPLE,
      intelligence: { ...SAMPLE.intelligence, revenue: {
        paidBookings: 7, totalZar: 3685, recordedTotalZar: 4545, excludedFixtureZar: 860,
      } },
    });
    expect(metrics).toEqual([
      { label: "Non-fixture booking revenue", value: zarLabel(3685) },
      { label: "Excluded test fixtures", value: zarLabel(860) },
      { label: "Historical recorded total", value: zarLabel(4545) },
    ]);
  });

  it("does not fabricate revenue when the API has no revenue payload", () => {
    expect(buildOfficeFunnelRevenueMetrics({ ...SAMPLE, intelligence: { ...SAMPLE.intelligence, revenue: undefined } })).toBeNull();
    expect(buildOfficeFunnelRevenueMetrics({})).toBeNull();
  });

  it("shows unavailable amounts as dashes rather than pretending they are zero", () => {
    expect(buildOfficeFunnelRevenueMetrics({
      ...SAMPLE,
      intelligence: { ...SAMPLE.intelligence, revenue: { totalZar: 0 } },
    })).toEqual([
      { label: "Non-fixture booking revenue", value: zarLabel(0) },
      { label: "Excluded test fixtures", value: "—" },
      { label: "Historical recorded total", value: "—" },
    ]);
  });

  it("builds four KPI cards from intelligence payload", () => {
    const kpis = buildOfficeFunnelKpis(SAMPLE);
    expect(kpis).toHaveLength(4);
    expect(kpis[0]?.label).toBe("Booking → paid");
    expect(kpis[0]?.value).toBe("15.5%");
    expect(kpis[1]?.label).toBe("Checkout → paid");
    expect(kpis[1]?.value).toBe("66.7%");
    expect(kpis[3]?.label).toBe("Paystack drop-off");
    expect(kpis[3]?.value).toBe("20.0%");
  });
});

describe("sliceDailyTrends", () => {
  it("returns trailing slice of daily trends", () => {
    expect(sliceDailyTrends(SAMPLE, 1)).toHaveLength(1);
    expect(dailyTrendMax(sliceDailyTrends(SAMPLE))).toBe(8);
  });
});

describe("dailyTrendBarHeights", () => {
  it("renders zero-height bars on truly inactive days while leaving date rows available", () => {
    expect(dailyTrendBarHeights({ starts: 0, completed: 0, paystackAbandons: 0 }, 1)).toEqual({
      barHeight: 0,
      completedHeight: 0,
      abandonsHeight: 0,
    });
  });

  it("retains positive blue bar height for days with starts", () => {
    expect(dailyTrendBarHeights({ starts: 1, completed: 0, paystackAbandons: 0 }, 1)).toEqual({
      barHeight: 120,
      completedHeight: 0,
      abandonsHeight: 0,
    });
  });

  it("retains positive completion overlay without inventing starts", () => {
    expect(dailyTrendBarHeights({ starts: 0, completed: 1, paystackAbandons: 0 }, 2)).toEqual({
      barHeight: 60,
      completedHeight: 60,
      abandonsHeight: 0,
    });
  });

  it("retains Paystack abandon overlays even if there were no starts or completions", () => {
    expect(dailyTrendBarHeights({ starts: 0, completed: 0, paystackAbandons: 1 }, 2)).toEqual({
      barHeight: 60,
      completedHeight: 0,
      abandonsHeight: 60,
    });
  });

  it("uses the existing minimum visible height for low nonzero activity", () => {
    expect(dailyTrendBarHeights({ starts: 1, completed: 0, paystackAbandons: 0 }, 100).barHeight).toBe(4);
    expect(dailyTrendBarHeights({ starts: 0, completed: 0, paystackAbandons: 0 }, 100).barHeight).toBe(0);
  });
});

describe("overallFunnelConversionPct", () => {
  it("uses booking sessions to completed payment sessions", () => {
    expect(overallFunnelConversionPct(SAMPLE)).toBeCloseTo(15.5, 1);
  });

  it("returns null instead of 100% when funnel views are missing", () => {
    expect(
      overallFunnelConversionPct({
        sessions: 0,
        completedPaymentSessions: 14,
      }),
    ).toBeNull();
  });
});

describe("funnelVisitorCount", () => {
  it("falls back to correlated sessions when funnel views are zero", () => {
    expect(
      funnelVisitorCount({
        sessions: 19,
        sessionsWithFunnelView: 0,
        funnelStartSessions: 0,
      }),
    ).toBe(19);
  });
});

describe("buildOfficeFunnelRecommendations", () => {
  it("merges insights and anomalies with severity-based priority", () => {
    const rows = buildOfficeFunnelRecommendations(SAMPLE);
    expect(rows).toHaveLength(2);
    expect(rows[1]?.priority).toBe("high");
  });
});