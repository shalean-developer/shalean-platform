import { describe, expect, it } from "vitest";
import {
  isCleanerDashboardPipelineVisit,
  retiredEpochCleanerDashboardPayoutWire,
} from "@/lib/cleaner/cleanerPayoutEpoch";
import { normalizeCleanerPayoutSummaryRow } from "@/lib/cleaner/normalizeCleanerPayoutSummaryRow";

describe("cleanerPayoutEpoch", () => {
  it("treats July 2026+ as pipeline visits", () => {
    expect(isCleanerDashboardPipelineVisit("2026-07-01")).toBe(true);
    expect(isCleanerDashboardPipelineVisit("2026-06-30")).toBe(false);
  });

  it("retires pre-July pending rows to paid and excludes them from pipeline buckets", () => {
    const normalized = normalizeCleanerPayoutSummaryRow({
      booking_id: "b1",
      date: "2026-06-15",
      service: "Standard",
      location: "CPT",
      payout_status: "pending",
      payout_paid_at: null,
      payout_run_id: null,
      payout_frozen_cents: null,
      amount_cents: 25_000,
    });
    const wire = retiredEpochCleanerDashboardPayoutWire({
      visitYmd: "2026-06-15",
      normalized,
      inLockedWeeklyBatch: false,
      completedAt: "2026-06-15T10:00:00+02:00",
    });
    expect(wire.payout_status).toBe("paid");
    expect(wire.counts_toward_pipeline).toBe(false);
    expect(wire.in_frozen_batch).toBe(false);
    expect(wire.payout_paid_at).toBe("2026-06-15T10:00:00+02:00");
  });

  it("keeps July pending in the pipeline", () => {
    const normalized = normalizeCleanerPayoutSummaryRow({
      booking_id: "b2",
      date: "2026-07-03",
      service: "Standard",
      location: "CPT",
      payout_status: "pending",
      payout_paid_at: null,
      payout_run_id: null,
      payout_frozen_cents: null,
      amount_cents: 30_000,
    });
    const wire = retiredEpochCleanerDashboardPayoutWire({
      visitYmd: "2026-07-03",
      normalized,
      inLockedWeeklyBatch: false,
    });
    expect(wire.payout_status).toBe("pending");
    expect(wire.counts_toward_pipeline).toBe(true);
  });
});
