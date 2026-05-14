import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  applyOpsHealthAcknowledgements,
  listOpsHealthAcknowledgements,
  opsHealthFindingKey,
  recordOpsHealthAcknowledgement,
} from "@/lib/observability/opsHealthAcknowledgements";
import type { ProductionHealthSummary } from "@/lib/observability/productionHealthMetrics";

function summary(): ProductionHealthSummary {
  return {
    ok: true,
    generatedAt: "2026-05-14T10:00:00.000Z",
    scanLimit: 500,
    totals: { critical: 2, high: 1, medium: 0, low: 0, info: 0 },
    findings: [
      {
        code: "payment_verified_not_finalized",
        severity: "critical",
        count: 2,
        message: "Verified payment was not finalized.",
        sampleIds: ["job-2", "job-1"],
      },
      {
        code: "cron_stale_or_missing_success",
        severity: "high",
        count: 1,
        message: "Cron stale.",
        sampleIds: ["generate-recurring-bookings"],
      },
    ],
  };
}

describe("Ops Health acknowledgements", () => {
  it("builds stable finding keys from sorted bounded sample ids", () => {
    expect(opsHealthFindingKey("payment_verified_not_finalized", ["job-2", "job-1", "job-1"])).toBe(
      "payment_verified_not_finalized:job-1|job-2",
    );
  });

  it("hides acknowledged findings while leaving unresolved findings visible", () => {
    const view = applyOpsHealthAcknowledgements(summary(), [
      {
        key: "payment_verified_not_finalized:job-1|job-2",
        code: "payment_verified_not_finalized",
        sampleIds: ["job-1", "job-2"],
        status: "acknowledged",
        operatorEmail: "admin@example.com",
        createdAt: "2026-05-14T10:05:00.000Z",
      },
    ]);

    expect(view.visibleSummary.findings.map((f) => f.code)).toEqual(["cron_stale_or_missing_success"]);
    expect(view.visibleSummary.totals).toEqual({ critical: 0, high: 1, medium: 0, low: 0, info: 0 });
    expect(view.acknowledgedFindings).toHaveLength(1);
    expect(view.acknowledgedFindings[0]?.diagnostics).toMatchObject({
      acknowledgement_key: "payment_verified_not_finalized:job-1|job-2",
      acknowledged: true,
    });
  });

  it("does not hide findings after the latest acknowledgement is resolved", () => {
    const view = applyOpsHealthAcknowledgements(summary(), [
      {
        key: "payment_verified_not_finalized:job-1|job-2",
        code: "payment_verified_not_finalized",
        sampleIds: ["job-1", "job-2"],
        status: "resolved",
        operatorEmail: "admin@example.com",
        createdAt: "2026-05-14T10:05:00.000Z",
      },
    ]);

    expect(view.visibleSummary.findings.map((f) => f.code)).toEqual([
      "payment_verified_not_finalized",
      "cron_stale_or_missing_success",
    ]);
    expect(view.acknowledgedFindings).toEqual([]);
  });

  it("preserves acknowledgement audit metadata from system logs", async () => {
    const admin = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(() => ({
              limit: vi.fn().mockResolvedValue({
                data: [
                  {
                    created_at: "2026-05-14T10:05:00.000Z",
                    context: {
                      code: "recurring_snapshot_drift",
                      sampleIds: ["rec-1"],
                      status: "acknowledged",
                      note: "Known stale May recurring drift.",
                      operatorId: "admin-1",
                      operatorEmail: "admin@example.com",
                    },
                  },
                ],
                error: null,
              }),
            })),
          })),
        })),
      })),
    };

    await expect(listOpsHealthAcknowledgements(admin as never)).resolves.toEqual([
      {
        key: "recurring_snapshot_drift:rec-1",
        code: "recurring_snapshot_drift",
        sampleIds: ["rec-1"],
        status: "acknowledged",
        note: "Known stale May recurring drift.",
        operatorId: "admin-1",
        operatorEmail: "admin@example.com",
        createdAt: "2026-05-14T10:05:00.000Z",
      },
    ]);
  });

  it("persists acknowledgement events without changing scanner state", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const admin = { from: vi.fn(() => ({ insert })) };

    const result = await recordOpsHealthAcknowledgement(admin as never, {
      code: "cron_stale_or_missing_success",
      sampleIds: ["generate-recurring-bookings"],
      status: "acknowledged",
      note: "Known cron backfill window.",
      operator: { id: "admin-1", email: "admin@example.com" },
    });

    expect(result).toMatchObject({
      ok: true,
      acknowledgement: {
        key: "cron_stale_or_missing_success:generate-recurring-bookings",
        code: "cron_stale_or_missing_success",
        status: "acknowledged",
        note: "Known cron backfill window.",
        operatorId: "admin-1",
        operatorEmail: "admin@example.com",
      },
    });
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        level: "info",
        source: "ops_health_acknowledgement",
        message: "ops_health_finding_acknowledged",
        context: expect.objectContaining({
          code: "cron_stale_or_missing_success",
          status: "acknowledged",
          operatorEmail: "admin@example.com",
        }),
      }),
    );
  });
});
