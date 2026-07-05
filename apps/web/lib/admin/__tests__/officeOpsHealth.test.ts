import { describe, expect, it } from "vitest";
import {
  assembleOfficeOpsHealthResponse,
} from "@/lib/admin/assembleOfficeOpsHealthResponse";
import {
  barsFromDailyCounts,
  buildOfficeOpsHealthSummary,
  formatOfficeOpsRelativeTime,
  isBookingEngineFindingCode,
  isDatabaseSystemLogRow,
  isPaymentGatewayFindingCode,
  lastJohannesburgYmds,
  resolveOpsHealthBanner,
  statusFromUptimeBars,
  uptimePctFromBars,
} from "@/lib/admin/officeOpsHealth";

describe("barsFromDailyCounts", () => {
  it("maps counts to uptime bars", () => {
    const bars = barsFromDailyCounts(
      ["2026-06-17", "2026-06-18", "2026-06-19"],
      new Map([
        ["2026-06-17", 0],
        ["2026-06-18", 2],
        ["2026-06-19", 6],
      ]),
      { warn: 1, down: 5 },
    );
    expect(bars).toEqual(["ok", "warn", "down"]);
    expect(uptimePctFromBars(bars)).toBe(33.3);
  });
});

describe("statusFromUptimeBars", () => {
  it("maps bar mix to status", () => {
    expect(statusFromUptimeBars(["ok", "ok", "ok"])).toBe("operational");
    expect(statusFromUptimeBars(["ok", "warn", "ok"])).toBe("degraded");
    expect(statusFromUptimeBars(Array.from({ length: 10 }, () => "down"))).toBe("down");
  });
});

describe("buildOfficeOpsHealthSummary", () => {
  it("marks database down when probe fails", () => {
    const summary = buildOfficeOpsHealthSummary({
      fetchedAt: "2026-06-19T10:00:00.000Z",
      productionHealth: {
        ok: true,
        generatedAt: "2026-06-19T10:00:00.000Z",
        scanLimit: 100,
        findings: [],
        totals: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
      },
      dbLatencyMs: null,
      dbOk: false,
      systemErrorRows: [],
      cronErrorRows: [],
      paymentDriftRows: [],
      notificationRows: [],
      whatsappPausedUntil: null,
      notificationsQueryOk: true,
    });
    const db = summary.services.find((service) => service.id === "database");
    expect(db?.currentStatus).toBe("down");
    expect(db?.status).toBe("down");
    expect(summary.allOperational).toBe(false);
  });

  it("splits current and 30d notification status when only history is bad", () => {
    const summary = buildOfficeOpsHealthSummary({
      fetchedAt: "2026-06-19T10:00:00.000Z",
      productionHealth: null,
      dbLatencyMs: 20,
      dbOk: true,
      systemErrorRows: [],
      cronErrorRows: [],
      paymentDriftRows: [],
      notificationRows: [
        ...Array.from({ length: 5 }, (_, i) => ({
          created_at: new Date(Date.parse("2026-06-19T10:00:00.000Z") - (i + 5) * 86_400_000).toISOString(),
          status: "failed",
        })),
        { created_at: "2026-06-19T09:10:00.000Z", status: "sent" },
        { created_at: "2026-06-19T09:15:00.000Z", status: "sent" },
      ],
      whatsappPausedUntil: null,
      notificationsQueryOk: true,
    });
    const notifications = summary.services.find((service) => service.id === "notifications");
    expect(notifications?.currentStatus).toBe("operational");
    expect(notifications?.periodStatus).not.toBe("operational");
  });

  it("ignores provider config auth failures for current notification status", () => {
    const summary = buildOfficeOpsHealthSummary({
      fetchedAt: "2026-06-20T15:00:00.000Z",
      productionHealth: null,
      dbLatencyMs: 20,
      dbOk: true,
      systemErrorRows: [],
      cronErrorRows: [],
      paymentDriftRows: [],
      notificationRows: [
        {
          created_at: "2026-06-20T12:15:00.000Z",
          status: "failed",
          error: 'twilio_401: {"code":20003,"message":"Authenticate"}',
        },
        {
          created_at: "2026-06-20T11:00:00.000Z",
          status: "failed",
          error: "API key is invalid",
        },
      ],
      whatsappPausedUntil: null,
      notificationsQueryOk: true,
    });
    const notifications = summary.services.find((service) => service.id === "notifications");
    expect(notifications?.currentStatus).toBe("operational");
    expect(notifications?.currentDetail).toContain("last hour");
  });

  it("shows maintenance for notifications when customer outbound is paused", () => {
    const summary = buildOfficeOpsHealthSummary({
      fetchedAt: "2026-06-19T10:00:00.000Z",
      productionHealth: null,
      dbLatencyMs: 20,
      dbOk: true,
      systemErrorRows: [],
      cronErrorRows: [],
      paymentDriftRows: [],
      notificationRows: [
        { created_at: "2026-06-19T09:00:00.000Z", status: "failed" },
        { created_at: "2026-06-19T08:00:00.000Z", status: "failed" },
      ],
      whatsappPausedUntil: null,
      customerOutboundPausedUntil: "2099-01-01T00:00:00.000Z",
      notificationsQueryOk: true,
    });
    const notifications = summary.services.find((service) => service.id === "notifications");
    expect(notifications?.currentStatus).toBe("maintenance");
    expect(notifications?.periodStatus).toBe("maintenance");
    expect(notifications?.currentDetail).toContain("paused");
  });

  it("marks website 30d degraded while current stays operational without recent errors", () => {
    const summary = buildOfficeOpsHealthSummary({
      fetchedAt: "2026-06-19T10:00:00.000Z",
      productionHealth: null,
      dbLatencyMs: 20,
      dbOk: true,
      systemErrorRows: Array.from({ length: 24 }, (_, i) => ({
        created_at: new Date(Date.parse("2026-06-19T10:00:00.000Z") - Math.floor(i / 2) * 86_400_000).toISOString(),
        source: "booking_checkout",
        message: "checkout validation failed",
      })),
      cronErrorRows: [],
      paymentDriftRows: [],
      notificationRows: [],
      whatsappPausedUntil: null,
      notificationsQueryOk: true,
    });
    const website = summary.services.find((service) => service.id === "website");
    expect(website?.currentStatus).toBe("operational");
    expect(website?.periodStatus).toBe("degraded");
  });

  it("does not mark booking engine down when only payment critical drift exists", () => {
    const summary = buildOfficeOpsHealthSummary({
      fetchedAt: "2026-06-19T10:00:00.000Z",
      productionHealth: {
        ok: true,
        generatedAt: "2026-06-19T10:00:00.000Z",
        scanLimit: 100,
        findings: [
          {
            code: "payment_verified_not_finalized",
            severity: "critical",
            count: 2,
            message: "Verified Paystack payment has an unresolved finalization/reconciliation job.",
            sampleIds: ["job-1", "job-2"],
          },
        ],
        totals: { critical: 2, high: 0, medium: 0, low: 0, info: 0 },
      },
      dbLatencyMs: 20,
      dbOk: true,
      systemErrorRows: [],
      cronErrorRows: [],
      paymentDriftRows: [],
      notificationRows: [],
      whatsappPausedUntil: null,
      notificationsQueryOk: true,
    });
    const booking = summary.services.find((service) => service.id === "booking_engine");
    const payment = summary.services.find((service) => service.id === "payment_gateway");
    expect(booking?.currentStatus).toBe("operational");
    expect(payment?.currentStatus).toBe("down");
  });

  it("marks booking engine down only for booking-related critical findings", () => {
    const summary = buildOfficeOpsHealthSummary({
      fetchedAt: "2026-06-19T10:00:00.000Z",
      productionHealth: {
        ok: true,
        generatedAt: "2026-06-19T10:00:00.000Z",
        scanLimit: 100,
        findings: [
          {
            code: "dispatch_stale_unassigned",
            severity: "high",
            count: 1,
            message: "Paid bookings remain unassigned or terminal-dispatch stale beyond the operations threshold.",
            sampleIds: ["booking-1"],
          },
        ],
        totals: { critical: 0, high: 1, medium: 0, low: 0, info: 0 },
      },
      dbLatencyMs: 20,
      dbOk: true,
      systemErrorRows: [],
      cronErrorRows: [],
      paymentDriftRows: [],
      notificationRows: [],
      whatsappPausedUntil: null,
      notificationsQueryOk: true,
    });
    const booking = summary.services.find((service) => service.id === "booking_engine");
    expect(booking?.currentStatus).toBe("degraded");
  });

  it("keeps booking engine operational when only cron schedule lag is reported", () => {
    const summary = buildOfficeOpsHealthSummary({
      fetchedAt: "2026-06-19T10:00:00.000Z",
      productionHealth: {
        ok: true,
        generatedAt: "2026-06-19T10:00:00.000Z",
        scanLimit: 100,
        findings: [
          {
            code: "cron_stale_or_missing_success",
            severity: "high",
            count: 2,
            message: "Critical cron jobs have no recent successful run.",
            sampleIds: ["charge-monthly-invoices"],
          },
        ],
        totals: { critical: 0, high: 1, medium: 0, low: 0, info: 0 },
      },
      dbLatencyMs: 20,
      dbOk: true,
      systemErrorRows: [],
      cronErrorRows: [],
      paymentDriftRows: [],
      notificationRows: [],
      whatsappPausedUntil: null,
      notificationsQueryOk: true,
    });
    const booking = summary.services.find((service) => service.id === "booking_engine");
    expect(booking?.currentStatus).toBe("operational");
    expect(booking?.currentDetail).toContain("cron schedule lag noted");
  });

  it("ignores infra system logs for website current status", () => {
    const summary = buildOfficeOpsHealthSummary({
      fetchedAt: "2026-06-19T10:00:00.000Z",
      productionHealth: null,
      dbLatencyMs: 20,
      dbOk: true,
      systemErrorRows: [
        { created_at: "2026-06-19T09:50:00.000Z", source: "cron_run", message: "booking-lifecycle" },
        { created_at: "2026-06-19T09:45:00.000Z", source: "production_health", message: "scan" },
        { created_at: "2026-06-19T09:35:00.000Z", source: "booking_checkout", message: "slot validation failed" },
      ],
      cronErrorRows: [],
      paymentDriftRows: [],
      notificationRows: [],
      whatsappPausedUntil: null,
      notificationsQueryOk: true,
    });
    const website = summary.services.find((service) => service.id === "website");
    expect(website?.currentStatus).toBe("operational");
  });

  it("derives booking 30d uptime from cron successes, not error volume alone", () => {
    const fetchedAt = "2026-06-19T10:00:00.000Z";
    const cronSuccessRows = Array.from({ length: 28 }, (_, i) => ({
      created_at: new Date(Date.parse(fetchedAt) - i * 86_400_000).toISOString(),
      job_name: "booking-lifecycle",
      status: "success",
    }));
    const summary = buildOfficeOpsHealthSummary({
      fetchedAt,
      productionHealth: null,
      dbLatencyMs: 20,
      dbOk: true,
      systemErrorRows: [],
      cronErrorRows: Array.from({ length: 18 }, (_, i) => ({
        created_at: new Date(Date.parse(fetchedAt) - Math.floor(i / 3) * 86_400_000).toISOString(),
        job_name: "booking-lifecycle",
        message: "handler failed",
      })),
      cronSuccessRows,
      paymentDriftRows: [],
      notificationRows: [],
      whatsappPausedUntil: null,
      notificationsQueryOk: true,
    });
    const booking = summary.services.find((service) => service.id === "booking_engine");
    expect(booking?.periodStatus).toBe("operational");
    expect(booking?.uptimePct).toBeGreaterThanOrEqual(90);
  });

  it("derives payment 30d uptime from payment drift rows, not cron errors", () => {
    const summary = buildOfficeOpsHealthSummary({
      fetchedAt: "2026-06-19T10:00:00.000Z",
      productionHealth: null,
      dbLatencyMs: 20,
      dbOk: true,
      systemErrorRows: [],
      cronErrorRows: Array.from({ length: 18 }, (_, i) => ({
        created_at: new Date(Date.parse("2026-06-19T10:00:00.000Z") - Math.floor(i / 3) * 86_400_000).toISOString(),
        job_name: "booking-lifecycle",
        message: "handler failed",
      })),
      paymentDriftRows: [],
      notificationRows: [],
      whatsappPausedUntil: null,
      notificationsQueryOk: true,
    });
    const payment = summary.services.find((service) => service.id === "payment_gateway");
    const booking = summary.services.find((service) => service.id === "booking_engine");
    expect(payment?.uptimePct).toBe(100);
    expect(booking?.periodStatus).toBe("degraded");
  });

  it("derives database 30d uptime from database system logs and probe failures", () => {
    const summary = buildOfficeOpsHealthSummary({
      fetchedAt: "2026-06-19T10:00:00.000Z",
      productionHealth: null,
      dbLatencyMs: null,
      dbOk: false,
      systemErrorRows: [
        {
          created_at: new Date(Date.parse("2026-06-19T10:00:00.000Z") - 2 * 86_400_000).toISOString(),
          source: "supabase",
          message: "connection pool exhausted",
        },
      ],
      cronErrorRows: [],
      paymentDriftRows: [],
      notificationRows: [],
      whatsappPausedUntil: null,
      notificationsQueryOk: true,
    });
    const database = summary.services.find((service) => service.id === "database");
    expect(database?.currentStatus).toBe("down");
    expect(database?.periodStatus).toBe("operational");
    expect(isDatabaseSystemLogRow({ source: "supabase", message: "connection pool exhausted" })).toBe(true);
  });
});

describe("assembleOfficeOpsHealthResponse", () => {
  it("includes acknowledgement metadata in the scanner payload", () => {
    const rawSummary = {
      ok: true as const,
      generatedAt: "2026-06-19T10:00:00.000Z",
      scanLimit: 100,
      findings: [
        {
          code: "payment_verified_not_finalized",
          severity: "critical" as const,
          count: 1,
          message: "Verified Paystack payment has an unresolved finalization/reconciliation job.",
          sampleIds: ["job-1"],
        },
      ],
      totals: { critical: 1, high: 0, medium: 0, low: 0, info: 0 },
    };

    const response = assembleOfficeOpsHealthResponse({
      fetchedAt: "2026-06-19T10:00:00.000Z",
      scanLimit: 100,
      productionHealth: { ...rawSummary, findings: [], totals: { critical: 0, high: 0, medium: 0, low: 0, info: 0 } },
      rawProductionHealth: rawSummary,
      acknowledgements: [
        {
          key: "payment_verified_not_finalized:job-1",
          code: "payment_verified_not_finalized",
          sampleIds: ["job-1"],
          status: "acknowledged",
          createdAt: "2026-06-19T09:00:00.000Z",
        },
      ],
      dbLatencyMs: 20,
      dbOk: true,
      systemErrorRows: [],
      cronErrorRows: [],
      paymentDriftRows: [],
      notificationRows: [],
      whatsappPausedUntil: null,
      customerOutboundPausedUntil: null,
      notificationsQueryOk: true,
    });

    expect(response.scanner.counts.acknowledgedHidden).toBe(1);
    expect(response.scanner.acknowledgedSummaries).toHaveLength(1);
    expect(response.scanner.summaries).toHaveLength(0);
  });
});

describe("resolveOpsHealthBanner", () => {
  it("uses warning tone when only current degradation and 30-day history issues exist", () => {
    const banner = resolveOpsHealthBanner({
      unified: { status: "degraded", issueBreakdown: { critical: 0, high: 1, medium: 1, low: 0, info: 0 }, consistencyValid: true, statusDescription: "" },
      overallCurrentStatus: "degraded",
      overallPeriodStatus: "down",
    });
    expect(banner.tone).toBe("warning");
    expect(banner.title).toContain("30-day history");
    expect(banner.subtitle).toContain("DEGRADED");
  });

  it("uses critical tone when unified is critical from production scan drift", () => {
    const banner = resolveOpsHealthBanner({
      unified: { status: "critical", issueBreakdown: { critical: 2, high: 0, medium: 0, low: 0, info: 0 }, consistencyValid: true, statusDescription: "" },
      overallCurrentStatus: "degraded",
      overallPeriodStatus: "down",
    });
    expect(banner.tone).toBe("critical");
    expect(banner.title).toContain("Critical drift");
    expect(banner.subtitle).toContain("CRITICAL");
  });

  it("returns healthy copy when all signals are operational", () => {
    const banner = resolveOpsHealthBanner({
      unified: { status: "healthy", issueBreakdown: { critical: 0, high: 0, medium: 0, low: 0, info: 0 }, consistencyValid: true, statusDescription: "" },
      overallCurrentStatus: "operational",
      overallPeriodStatus: "operational",
    });
    expect(banner).toEqual({
      tone: "healthy",
      title: "All systems operational",
      subtitle: "Ops health: HEALTHY · Now: Operational · 30d: Operational",
    });
  });
});

describe("finding code matchers", () => {
  it("separates booking-engine and payment-gateway scan codes", () => {
    expect(isBookingEngineFindingCode("cron_stale_or_missing_success")).toBe(true);
    expect(isBookingEngineFindingCode("payment_verified_not_finalized")).toBe(false);
    expect(isPaymentGatewayFindingCode("payment_verified_not_finalized")).toBe(true);
    expect(isPaymentGatewayFindingCode("monthly_invoice_paid_child_unsettled")).toBe(true);
    expect(isPaymentGatewayFindingCode("cron_stale_or_missing_success")).toBe(false);
  });
});

describe("lastJohannesburgYmds", () => {
  it("returns consecutive days", () => {
    const days = lastJohannesburgYmds(3, new Date("2026-06-19T10:00:00+02:00"));
    expect(days).toHaveLength(3);
    expect(days[2]).toBe("2026-06-19");
  });
});

describe("formatOfficeOpsRelativeTime", () => {
  it("formats recent timestamps", () => {
    expect(formatOfficeOpsRelativeTime(new Date().toISOString())).toBe("Just now");
  });
});
