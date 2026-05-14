import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  recordSystemMetric: vi.fn(async () => undefined),
  logSystemEvent: vi.fn(async () => undefined),
}));

vi.mock("@/lib/observability/recordSystemMetric", () => ({
  recordSystemMetric: mocks.recordSystemMetric,
}));

vi.mock("@/lib/logging/systemLog", () => ({
  logSystemEvent: mocks.logSystemEvent,
}));

import {
  buildProductionHealthSummary,
  detectPaymentFinalizationDrift,
  detectStaleCronRuns,
  recordProductionHealthMetric,
} from "@/lib/observability/productionHealthMetrics";

describe("productionHealthMetrics", () => {
  beforeEach(() => {
    mocks.recordSystemMetric.mockReset().mockResolvedValue(undefined);
    mocks.logSystemEvent.mockReset().mockResolvedValue(undefined);
  });

  it("aggregates scanner findings by severity with bounded sample ids", () => {
    const now = new Date("2026-05-14T10:00:00.000Z");

    const summary = buildProductionHealthSummary({
      now,
      scanLimit: 100,
      paymentSignals: [{ id: "failed-1", type: "booking_finalize" }],
      monthlyChildren: [
        {
          id: "child-1",
          invoice_status: "paid",
          status: "completed",
          payment_status: "pending_monthly",
          payout_status: "pending",
          payout_frozen_cents: null,
        },
      ],
      earningsRows: [{ id: "booking-1", status: "completed", display_earnings_cents: null }],
      payoutRows: [{ id: "payout-1", payout_status: "eligible", payout_frozen_cents: null }],
      dispatchRows: [
        {
          id: "dispatch-1",
          status: "pending",
          payment_status: "success",
          payment_completed_at: "2026-05-14T08:00:00.000Z",
          dispatch_status: "no_cleaner",
        },
      ],
      durationFallbackLogs: [{ id: "duration-1", source: "admin", message: "duration_fallback_used" }],
      workloadForceOverrideLogs: [
        {
          id: "workload-1",
          source: "admin",
          message: "assignment",
          context: { workloadOverrideCode: "admin_daily_workload_over_limit_force_override" },
        },
      ],
    });

    expect(summary.findings.map((f) => f.code)).toEqual([
      "booking_completed_missing_earnings_basis",
      "monthly_invoice_paid_child_unsettled",
      "payment_verified_not_finalized",
      "dispatch_stale_unassigned",
      "payout_eligibility_drift",
      "duration_fallback_usage",
      "workload_force_override_usage",
    ]);
    expect(summary.totals).toMatchObject({ critical: 3, high: 2, medium: 2 });
    expect(summary.findings.find((f) => f.code === "payment_verified_not_finalized")?.sampleIds).toEqual(["failed-1"]);
  });

  it("prevents false positives for settled monthly children, earnings basis, payout basis, and fresh dispatch", () => {
    const summary = buildProductionHealthSummary({
      now: new Date("2026-05-14T10:00:00.000Z"),
      paymentSignals: [{ id: "ignored-1", type: "payment_mismatch" }],
      monthlyChildren: [
        {
          id: "child-ok",
          invoice_status: "paid",
          status: "completed",
          payment_status: "success",
          payout_status: "eligible",
          payout_frozen_cents: 5000,
        },
        {
          id: "child-cancelled",
          invoice_status: "paid",
          status: "cancelled",
          payment_status: "pending_monthly",
          payout_status: "pending",
        },
      ],
      earningsRows: [{ id: "booking-ok", status: "completed", display_earnings_cents: 5000 }],
      payoutRows: [{ id: "payout-ok", payout_status: "eligible", payout_frozen_cents: 5000 }],
      dispatchRows: [
        {
          id: "dispatch-fresh",
          status: "pending",
          payment_status: "success",
          payment_completed_at: "2026-05-14T09:40:00.000Z",
          dispatch_status: "searching",
        },
      ],
    });

    expect(summary.findings).toEqual([]);
    expect(summary.totals).toEqual({ critical: 0, high: 0, medium: 0, low: 0, info: 0 });
  });

  it("classifies stale and missing cron success rows", () => {
    const findings = detectStaleCronRuns(
      [
        {
          job_name: "booking-lifecycle",
          status: "success",
          created_at: "2026-05-14T08:00:00.000Z",
        },
        {
          job_name: "generate-recurring-bookings",
          status: "error",
          created_at: "2026-05-14T09:50:00.000Z",
        },
      ],
      [
        { jobName: "booking-lifecycle", maxAgeMinutes: 60 },
        { jobName: "generate-recurring-bookings", maxAgeMinutes: 30 },
        { jobName: "charge-monthly-invoices", maxAgeMinutes: 120 },
      ],
      new Date("2026-05-14T10:00:00.000Z"),
    );

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      code: "cron_stale_or_missing_success",
      severity: "high",
      sampleIds: ["generate-recurring-bookings", "charge-monthly-invoices", "booking-lifecycle"],
    });
    expect(findings[0]?.diagnostics).toMatchObject({
      missing: ["generate-recurring-bookings", "charge-monthly-invoices"],
      stale: ["booking-lifecycle"],
    });
  });

  it("aggregates recurring drift through the existing recurring/monthly probes", () => {
    const summary = buildProductionHealthSummary({
      recurringRows: [
        {
          id: "rec-child-1",
          recurring_id: "rec-1",
          is_recurring_generated: true,
          is_monthly_billing_booking: true,
          billing_type: "recurring_invoice",
          status: "completed",
          payment_status: "success",
          payout_status: "eligible",
          payout_frozen_cents: 5000,
          display_earnings_cents: 5000,
          duration_minutes: null,
          booking_snapshot: { locked: { duration: 4, price: 900 } },
        },
      ],
    });

    expect(summary.findings).toHaveLength(1);
    expect(summary.findings[0]).toMatchObject({
      code: "recurring_snapshot_drift",
      count: 1,
      sampleIds: ["rec-child-1"],
    });
    expect(summary.findings[0]?.diagnostics).toMatchObject({
      by_code: { recurring_child_missing_duration_minutes: 1 },
    });
  });

  it("detects open payment finalization jobs and ignores unrelated failed jobs", () => {
    expect(
      detectPaymentFinalizationDrift([
        { id: "job-1", type: "booking_finalize" },
        { id: "job-2", type: "email_delivery" },
      ]),
    ).toEqual([
      {
        code: "payment_verified_not_finalized",
        severity: "critical",
        count: 1,
        message: "Verified Paystack payment has an unresolved finalization/reconciliation job.",
        sampleIds: ["job-1"],
      },
    ]);
  });

  it("metric wrapper never throws when durable metric or log sinks fail", async () => {
    mocks.recordSystemMetric.mockRejectedValueOnce(new Error("metric sink down"));

    await expect(
      recordProductionHealthMetric({
        metric: "production_health.test",
        value: 1,
        metadata: { sample: true },
      }),
    ).resolves.toEqual({ ok: false, error: "metric sink down" });

    mocks.logSystemEvent.mockRejectedValueOnce(new Error("log sink down"));
    await expect(
      recordProductionHealthMetric({
        metric: "production_health.test",
        value: 1,
      }),
    ).resolves.toEqual({ ok: false, error: "log sink down" });
  });
});
