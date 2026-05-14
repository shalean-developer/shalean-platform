import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  buildOpsHealthAlertCandidates,
  buildOpsHealthAlertPayload,
  checkOpsHealthAlertCooldown,
  recordOpsHealthAlertCooldownMarker,
  selectOpsHealthAlertCandidatesSafe,
} from "@/lib/observability/opsHealthAlerts";
import type { ProductionHealthSummary } from "@/lib/observability/productionHealthMetrics";

function summary(findings: ProductionHealthSummary["findings"]): ProductionHealthSummary {
  return {
    ok: true,
    generatedAt: "2026-05-14T10:00:00.000Z",
    scanLimit: 500,
    totals: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
    findings,
  };
}

function adminWithCooldownRows(rows: Array<{ created_at?: string }> = [], error: { message: string } | null = null) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    gte: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn().mockResolvedValue({ data: rows, error }),
  };
  return {
    from: vi.fn(() => builder),
    builder,
  };
}

describe("Ops Health alert policy helpers", () => {
  it("maps critical findings to alert candidates", () => {
    const candidates = buildOpsHealthAlertCandidates(
      summary([
        {
          code: "payment_verified_not_finalized",
          severity: "critical",
          count: 1,
          message: "raw scanner message",
          sampleIds: ["failed-job-1"],
        },
      ]),
    );

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      code: "payment_verified_not_finalized",
      severity: "critical",
      cooldownMinutes: 15,
      findingKey: "payment_verified_not_finalized:failed-job-1",
      payload: {
        kind: "ops_health_alert",
        message: "Verified payment has not finalized into booking settlement.",
        sampleIds: ["failed-job-1"],
      },
    });
  });

  it("returns no candidates for healthy scans and low/medium findings", () => {
    expect(buildOpsHealthAlertCandidates(summary([]))).toEqual([]);
    expect(
      buildOpsHealthAlertCandidates(
        summary([
          {
            code: "duration_fallback_usage",
            severity: "medium",
            count: 1,
            message: "Duration fallback.",
            sampleIds: ["log-1"],
          },
          {
            code: "workload_force_override_usage",
            severity: "medium",
            count: 1,
            message: "Workload force.",
            sampleIds: ["log-2"],
          },
        ]),
      ),
    ).toEqual([]);
  });

  it("suppresses exact acknowledged findings", () => {
    const candidates = buildOpsHealthAlertCandidates(
      summary([
        {
          code: "monthly_invoice_paid_child_unsettled",
          severity: "critical",
          count: 2,
          message: "Invoice drift.",
          sampleIds: ["child-2", "child-1"],
        },
      ]),
      {
        acknowledgements: [
          {
            key: "monthly_invoice_paid_child_unsettled:child-1|child-2",
            code: "monthly_invoice_paid_child_unsettled",
            sampleIds: ["child-1", "child-2"],
            status: "acknowledged",
            createdAt: "2026-05-14T10:05:00.000Z",
          },
        ],
      },
    );

    expect(candidates).toEqual([]);
  });

  it("allows resolved findings to alert again", () => {
    const candidates = buildOpsHealthAlertCandidates(
      summary([
        {
          code: "monthly_invoice_paid_child_unsettled",
          severity: "critical",
          count: 1,
          message: "Invoice drift.",
          sampleIds: ["child-1"],
        },
      ]),
      {
        acknowledgements: [
          {
            key: "monthly_invoice_paid_child_unsettled:child-1",
            code: "monthly_invoice_paid_child_unsettled",
            sampleIds: ["child-1"],
            status: "resolved",
            createdAt: "2026-05-14T10:05:00.000Z",
          },
        ],
      },
    );

    expect(candidates.map((candidate) => candidate.code)).toEqual(["monthly_invoice_paid_child_unsettled"]);
  });

  it("uses code-level cooldown to suppress duplicates", async () => {
    const admin = adminWithCooldownRows([{ created_at: "2026-05-14T09:55:00.000Z" }]);
    const [candidate] = buildOpsHealthAlertCandidates(
      summary([
        {
          code: "dispatch_stale_unassigned",
          severity: "high",
          count: 1,
          message: "Stale dispatch.",
          sampleIds: ["booking-1"],
        },
      ]),
    );

    const result = await checkOpsHealthAlertCooldown(admin as never, candidate!, {
      now: "2026-05-14T10:00:00.000Z",
    });

    expect(result).toEqual({
      ok: true,
      allowed: false,
      reason: "cooldown",
      latestAt: "2026-05-14T09:55:00.000Z",
    });
    expect(admin.builder.eq).toHaveBeenCalledWith("context->>cooldownKey", "dispatch_stale_unassigned");
  });

  it("allows alerts after cooldown expiry", async () => {
    const admin = adminWithCooldownRows([]);
    const [candidate] = buildOpsHealthAlertCandidates(
      summary([
        {
          code: "cron_stale_or_missing_success",
          severity: "high",
          count: 1,
          message: "Cron stale.",
          sampleIds: ["generate-recurring-bookings"],
        },
      ]),
    );

    await expect(
      checkOpsHealthAlertCooldown(admin as never, candidate!, {
        now: "2026-05-14T10:00:00.000Z",
      }),
    ).resolves.toEqual({ ok: true, allowed: true });
  });

  it("builds bounded redacted payloads with safe diagnostics only", () => {
    const payload = buildOpsHealthAlertPayload(
      {
        code: "cron_stale_or_missing_success",
        severity: "high",
        count: 20,
        message: "raw message should not be used",
        sampleIds: Array.from({ length: 14 }, (_, i) => `job-${i + 1}`),
        diagnostics: {
          missing: ["generate-recurring-bookings"],
          stale: ["booking-lifecycle"],
          customer_email: "customer@example.com",
          payload: { unsafe: true },
        },
      },
      { generatedAt: "2026-05-14T10:00:00.000Z" },
    );

    expect(payload).toMatchObject({
      kind: "ops_health_alert",
      code: "cron_stale_or_missing_success",
      sampleIds: ["job-1", "job-2", "job-3", "job-4", "job-5", "job-6", "job-7", "job-8", "job-9", "job-10"],
      diagnostics: {
        missing: ["generate-recurring-bookings"],
        stale: ["booking-lifecycle"],
      },
    });
    expect(JSON.stringify(payload)).not.toContain("customer@example.com");
    expect(JSON.stringify(payload)).not.toContain("unsafe");
  });

  it("records cooldown markers without external delivery", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const admin = { from: vi.fn(() => ({ insert })) };
    const [candidate] = buildOpsHealthAlertCandidates(
      summary([
        {
          code: "booking_completed_missing_earnings_basis",
          severity: "critical",
          count: 1,
          message: "Missing earnings.",
          sampleIds: ["booking-1"],
        },
      ]),
    );

    await expect(
      recordOpsHealthAlertCooldownMarker(admin as never, candidate!, {
        now: "2026-05-14T10:00:00.000Z",
      }),
    ).resolves.toEqual({ ok: true });
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        level: "error",
        source: "ops_health_alert_sent",
        message: "ops_health_alert_policy_matched",
        context: expect.objectContaining({
          kind: "ops_health_alert",
          code: "booking_completed_missing_earnings_basis",
          cooldownKey: "booking_completed_missing_earnings_basis",
        }),
      }),
    );
  });

  it("safe selector never throws when cooldown storage fails", async () => {
    const admin = {
      from: vi.fn(() => {
        throw new Error("system_logs unavailable");
      }),
    };

    const result = await selectOpsHealthAlertCandidatesSafe(
      admin as never,
      summary([
        {
          code: "payout_eligibility_drift",
          severity: "high",
          count: 1,
          message: "Payout drift.",
          sampleIds: ["booking-1"],
        },
      ]),
    );

    expect(result).toMatchObject({
      ok: true,
      candidates: [],
      suppressed: [
        {
          reason: "cooldown_check_failed",
          error: "system_logs unavailable",
        },
      ],
      errors: ["system_logs unavailable"],
    });
  });
});
