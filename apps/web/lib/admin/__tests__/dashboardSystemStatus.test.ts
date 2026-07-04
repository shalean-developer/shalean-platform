import { describe, expect, it } from "vitest";
import {
  buildDashboardSystemStatusFromOfficeOps,
  mapOfficeOpsStatusToDashboard,
} from "@/lib/admin/dashboardSystemStatus";
import type { OfficeOpsHealthSummary } from "@/lib/admin/officeOpsHealth";

function minimalOfficeSummary(overrides: Partial<OfficeOpsHealthSummary> = {}): OfficeOpsHealthSummary {
  return {
    fetchedAt: "2026-06-20T12:00:00.000Z",
    overallStatus: "operational",
    overallCurrentStatus: "operational",
    overallPeriodStatus: "operational",
    allOperational: true,
    allOperationalNow: true,
    services: [
      {
        id: "website",
        name: "Website",
        description: "",
        status: "operational",
        currentStatus: "operational",
        periodStatus: "operational",
        uptimePct: 100,
        latencyLabel: null,
        lastCheckedLabel: "Just now",
        uptimeBars: [],
        currentDetail: null,
        periodDetail: null,
      },
      {
        id: "booking_engine",
        name: "Booking engine",
        description: "",
        status: "degraded",
        currentStatus: "degraded",
        periodStatus: "operational",
        uptimePct: 100,
        latencyLabel: null,
        lastCheckedLabel: "Just now",
        uptimeBars: [],
        currentDetail: "1 cron error",
        periodDetail: null,
      },
      {
        id: "payment_gateway",
        name: "Payment gateway",
        description: "",
        status: "operational",
        currentStatus: "operational",
        periodStatus: "operational",
        uptimePct: 100,
        latencyLabel: null,
        lastCheckedLabel: "Just now",
        uptimeBars: [],
        currentDetail: null,
        periodDetail: null,
      },
      {
        id: "database",
        name: "Supabase (DB)",
        description: "",
        status: "operational",
        currentStatus: "operational",
        periodStatus: "operational",
        uptimePct: 100,
        latencyLabel: "20ms",
        lastCheckedLabel: "Just now",
        uptimeBars: [],
        currentDetail: null,
        periodDetail: null,
      },
      {
        id: "notifications",
        name: "Notification service",
        description: "",
        status: "maintenance",
        currentStatus: "maintenance",
        periodStatus: "maintenance",
        uptimePct: 50,
        latencyLabel: null,
        lastCheckedLabel: "Just now",
        uptimeBars: [],
        currentDetail: "Paused",
        periodDetail: null,
      },
    ],
    kpis: {
      monitored: 5,
      healthyNow: 3,
      issuesNow: 2,
      healthy30d: 4,
      issues30d: 1,
      avgUptimePct: 90,
    },
    productionHealth: {
      status: "degraded",
      generatedAt: "2026-06-20T12:00:00.000Z",
      scanLimit: 250,
      findings: [],
      totals: { critical: 0, high: 1, medium: 0, low: 0, info: 0 },
      totalFindings: 3,
    },
    unified: {
      status: "degraded",
      issueBreakdown: { critical: 0, high: 1, medium: 0, low: 0, info: 0 },
      consistencyValid: true,
      statusDescription: "Degraded",
    },
    scanner: {
      ok: true,
      status: "degraded",
      degraded: false,
      generatedAt: "2026-06-20T12:00:00.000Z",
      lastScan: {
        source: "unified_ops_health",
        scanLimit: 250,
        metricsRecorded: false,
        degraded: false,
      },
      counts: {
        critical: 0,
        high: 1,
        medium: 0,
        low: 0,
        info: 0,
        totalFindings: 3,
        acknowledgedHidden: 0,
      },
      summaries: [
        {
          code: "dispatch_stale_unassigned",
          severity: "high",
          count: 3,
          message: "Dispatch retries pending",
          sampleIds: ["b1"],
        },
      ],
      acknowledgedSummaries: [],
      acknowledgements: [],
      sampleIds: {},
    },
    ...overrides,
  };
}

describe("dashboardSystemStatus", () => {
  it("maps maintenance to degraded for dashboard badges", () => {
    expect(mapOfficeOpsStatusToDashboard("maintenance")).toBe("degraded");
    expect(mapOfficeOpsStatusToDashboard("operational")).toBe("operational");
  });

  it("uses unified ops-health service current statuses for the three dashboard rows", () => {
    const payload = buildDashboardSystemStatusFromOfficeOps(minimalOfficeSummary(), 0);
    expect(payload.website).toBe("operational");
    expect(payload.bookingEngine).toBe("degraded");
    expect(payload.paymentGateway).toBe("operational");
    expect(payload.productionHealth.totalFindings).toBe(3);
    expect(payload.productionHealth.topFindings?.[0]?.code).toBe("dispatch_stale_unassigned");
    expect(payload.cronErrorsLast24h).toBe(0);
  });
});
