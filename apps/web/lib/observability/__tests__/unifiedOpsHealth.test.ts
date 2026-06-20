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
});
