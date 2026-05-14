import { describe, expect, it } from "vitest";
import { computeAdminDashboardConversionSummary } from "@/lib/admin/dashboardConversion";

describe("computeAdminDashboardConversionSummary", () => {
  it("counts distinct quote sessions with analytics_session_id coalescing", () => {
    const summary = computeAdminDashboardConversionSummary({
      bookingEvents: [
        { session_id: "raw-a", analytics_session_id: "analytics-a", step: "quote", event_type: "view" },
        { session_id: "raw-a-duplicate", analytics_session_id: "analytics-a", step: "quote", event_type: "view" },
        { session_id: "raw-b", analytics_session_id: null, step: "quote", event_type: "view" },
      ],
    });

    expect(summary.available).toBe(true);
    if (!summary.available) throw new Error("summary unexpectedly unavailable");
    expect(summary.funnelSessionsQuote).toBe(2);
    expect(summary.conversionRatePct).toBe(0);
  });

  it("counts checkout payment sessions from booking_events and user_events", () => {
    const summary = computeAdminDashboardConversionSummary({
      bookingEvents: [
        { session_id: "raw-a", analytics_session_id: "analytics-a", step: "quote", event_type: "view" },
        { session_id: "raw-b", analytics_session_id: "analytics-b", step: "quote", event_type: "view" },
        { session_id: "raw-a-payment", analytics_session_id: "analytics-a", step: "payment", event_type: "view" },
      ],
      userEvents: [
        { event_type: "booking_payment_started", payload: { analytics_session_id: "analytics-b" } },
      ],
    });

    expect(summary.available).toBe(true);
    if (!summary.available) throw new Error("summary unexpectedly unavailable");
    expect(summary.funnelSessionsQuote).toBe(2);
    expect(summary.funnelSessionsPayment).toBe(2);
    expect(summary.conversionRatePct).toBe(100);
  });

  it("falls back to metadata analytics_session_id before raw session_id", () => {
    const summary = computeAdminDashboardConversionSummary({
      bookingEvents: [
        {
          session_id: "raw-quote",
          analytics_session_id: null,
          step: "quote",
          event_type: "view",
          metadata: { analytics_session_id: "analytics-shared" },
        },
        {
          session_id: "raw-payment",
          analytics_session_id: "analytics-shared",
          step: "payment",
          event_type: "next",
        },
      ],
    });

    expect(summary.available).toBe(true);
    if (!summary.available) throw new Error("summary unexpectedly unavailable");
    expect(summary.funnelSessionsQuote).toBe(1);
    expect(summary.funnelSessionsPayment).toBe(1);
    expect(summary.conversionRatePct).toBe(100);
  });

  it("returns unavailable on read errors instead of misleading zero conversion", () => {
    const summary = computeAdminDashboardConversionSummary({
      bookingEvents: [],
      bookingEventsError: { message: "permission denied for table booking_events" },
    });

    expect(summary.available).toBe(false);
    if (summary.available) throw new Error("summary unexpectedly available");
    expect(summary.conversionRatePct).toBeNull();
    expect(summary.funnelSessionsQuote).toBeNull();
    expect(summary.funnelSessionsPayment).toBeNull();
    expect(summary.error).toContain("permission denied");
  });

  it("reports 0% legitimately for empty readable events", () => {
    const summary = computeAdminDashboardConversionSummary({
      bookingEvents: [],
      userEvents: [],
    });

    expect(summary.available).toBe(true);
    if (!summary.available) throw new Error("summary unexpectedly unavailable");
    expect(summary.funnelSessionsQuote).toBe(0);
    expect(summary.funnelSessionsPayment).toBe(0);
    expect(summary.conversionRatePct).toBe(0);
  });
});
