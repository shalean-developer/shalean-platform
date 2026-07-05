import { describe, expect, it } from "vitest";
import type { OfficeOpsServiceCard } from "@/lib/admin/officeOpsHealth";
import {
  deriveServiceHealthFindings,
  evaluateUnifiedPlatformStatus,
  mergeUnifiedHealthFindings,
  validateHealthConsistency,
} from "@/lib/observability/unifiedOpsHealth";

function service(partial: Partial<OfficeOpsServiceCard> & Pick<OfficeOpsServiceCard, "id" | "name">): OfficeOpsServiceCard {
  return {
    description: "test",
    status: partial.currentStatus ?? "operational",
    currentStatus: partial.currentStatus ?? "operational",
    periodStatus: partial.periodStatus ?? "operational",
    uptimePct: 100,
    latencyLabel: null,
    lastCheckedLabel: "now",
    uptimeBars: ["ok"],
    currentDetail: partial.currentDetail ?? null,
    periodDetail: partial.periodDetail ?? null,
    ...partial,
  };
}

describe("deriveServiceHealthFindings", () => {
  it("creates findings for degraded website and notification services", () => {
    const findings = deriveServiceHealthFindings([
      service({
        id: "website",
        name: "Website",
        currentStatus: "degraded",
        currentDetail: "7 system error(s) in the last hour",
      }),
      service({
        id: "notifications",
        name: "Notification service",
        currentStatus: "down",
        currentDetail: "0% delivery success in the last 24 hours",
      }),
    ]);

    expect(findings).toHaveLength(2);
    expect(findings.some((finding) => finding.severity === "medium" && finding.message.includes("Website"))).toBe(true);
    expect(findings.some((finding) => finding.severity === "high" && finding.message.includes("Notification"))).toBe(true);
  });
});

describe("mergeUnifiedHealthFindings", () => {
  it("merges scan and service findings", () => {
    const merged = mergeUnifiedHealthFindings({
      fetchedAt: "2026-06-20T12:00:00.000Z",
      scanLimit: 100,
      scanSummary: {
        ok: true,
        generatedAt: "2026-06-20T12:00:00.000Z",
        scanLimit: 100,
        findings: [
          {
            code: "cron_stale_or_missing_success",
            severity: "high",
            count: 2,
            message: "Critical cron jobs have no recent successful run.",
            sampleIds: ["booking-lifecycle"],
          },
        ],
        totals: { critical: 0, high: 1, medium: 0, low: 0, info: 0 },
      },
      serviceFindings: deriveServiceHealthFindings([
        service({
          id: "database",
          name: "Supabase (DB)",
          currentStatus: "degraded",
          currentDetail: "Probe latency 1.5s",
        }),
      ]),
    });

    expect(merged.findings).toHaveLength(2);
    expect(merged.totals.high).toBe(2);
    expect(merged.totals.medium).toBe(1);
  });
});

describe("evaluateUnifiedPlatformStatus", () => {
  it("cannot be healthy when service issues exist", () => {
    const services = [
      service({
        id: "website",
        name: "Website",
        currentStatus: "degraded",
      }),
    ];
    const merged = mergeUnifiedHealthFindings({
      fetchedAt: "2026-06-20T12:00:00.000Z",
      scanLimit: 100,
      scanSummary: {
        ok: true,
        generatedAt: "2026-06-20T12:00:00.000Z",
        scanLimit: 100,
        findings: [],
        totals: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
      },
      serviceFindings: deriveServiceHealthFindings(services),
    });

    expect(evaluateUnifiedPlatformStatus(services, merged)).toBe("degraded");
    expect(
      validateHealthConsistency({
        services,
        issuesNow: 1,
        mergedSummary: merged,
        unifiedStatus: evaluateUnifiedPlatformStatus(services, merged),
      }),
    ).toBe(true);
  });

  it("does not mark platform critical for 30-day history alone", () => {
    const services = [
      service({
        id: "booking_engine",
        name: "Booking engine",
        currentStatus: "degraded",
        periodStatus: "down",
        currentDetail: "2 cron error(s) in 24h",
        periodDetail: "60% clean cron days in 30d",
      }),
    ];
    const merged = mergeUnifiedHealthFindings({
      fetchedAt: "2026-06-20T12:00:00.000Z",
      scanLimit: 100,
      scanSummary: {
        ok: true,
        generatedAt: "2026-06-20T12:00:00.000Z",
        scanLimit: 100,
        findings: [],
        totals: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
      },
      serviceFindings: deriveServiceHealthFindings(services),
    });

    expect(evaluateUnifiedPlatformStatus(services, merged)).toBe("degraded");
  });

  it("stays healthy when only cron schedule lag is reported and services are operational", () => {
    const services = [
      service({ id: "website", name: "Website" }),
      service({ id: "booking_engine", name: "Booking engine" }),
      service({ id: "payment_gateway", name: "Payment gateway" }),
      service({ id: "database", name: "Supabase (DB)" }),
      service({ id: "notifications", name: "Notification service" }),
    ];
    const merged = mergeUnifiedHealthFindings({
      fetchedAt: "2026-06-20T12:00:00.000Z",
      scanLimit: 100,
      scanSummary: {
        ok: true,
        generatedAt: "2026-06-20T12:00:00.000Z",
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
      serviceFindings: [],
    });

    expect(evaluateUnifiedPlatformStatus(services, merged)).toBe("healthy");
    expect(
      validateHealthConsistency({
        services,
        issuesNow: 0,
        mergedSummary: merged,
        unifiedStatus: evaluateUnifiedPlatformStatus(services, merged),
      }),
    ).toBe(true);
  });

  it("marks platform critical for production scan drift", () => {
    const services = [
      service({
        id: "payment_gateway",
        name: "Payment gateway",
        currentStatus: "down",
      }),
    ];
    const merged = mergeUnifiedHealthFindings({
      fetchedAt: "2026-06-20T12:00:00.000Z",
      scanLimit: 100,
      scanSummary: {
        ok: true,
        generatedAt: "2026-06-20T12:00:00.000Z",
        scanLimit: 100,
        findings: [
          {
            code: "payment_verified_not_finalized",
            severity: "critical",
            count: 1,
            message: "Verified Paystack payment has an unresolved finalization/reconciliation job.",
            sampleIds: ["job-1"],
          },
        ],
        totals: { critical: 1, high: 0, medium: 0, low: 0, info: 0 },
      },
      serviceFindings: deriveServiceHealthFindings(services),
    });

    expect(evaluateUnifiedPlatformStatus(services, merged)).toBe("critical");
  });
});
