import { describe, expect, it } from "vitest";
import { resolveVisitEditBlockedReason } from "@/lib/admin/payouts/officeCleanerEditableVisits";

describe("resolveVisitEditBlockedReason", () => {
  const batchStatusById = new Map<string, string>([
    ["batch-pending", "pending"],
    ["batch-frozen", "frozen"],
    ["batch-approved", "approved"],
  ]);

  it("blocks team jobs", () => {
    expect(
      resolveVisitEditBlockedReason(
        { is_team_job: true, payout_status: "eligible", payout_paid_at: null, payout_id: null },
        batchStatusById,
      ),
    ).toMatch(/team job/i);
  });

  it("allows unbatched eligible visits", () => {
    expect(
      resolveVisitEditBlockedReason(
        { is_team_job: false, payout_status: "eligible", payout_paid_at: null, payout_id: null },
        batchStatusById,
      ),
    ).toBeNull();
  });

  it("allows visits in pending or frozen batches", () => {
    expect(
      resolveVisitEditBlockedReason(
        { is_team_job: false, payout_status: "eligible", payout_paid_at: null, payout_id: "batch-pending" },
        batchStatusById,
      ),
    ).toBeNull();
    expect(
      resolveVisitEditBlockedReason(
        { is_team_job: false, payout_status: "eligible", payout_paid_at: null, payout_id: "batch-frozen" },
        batchStatusById,
      ),
    ).toBeNull();
  });

  it("blocks visits in approved batches", () => {
    expect(
      resolveVisitEditBlockedReason(
        { is_team_job: false, payout_status: "eligible", payout_paid_at: null, payout_id: "batch-approved" },
        batchStatusById,
      ),
    ).toMatch(/approved or paid/i);
  });

  it("blocks paid visits", () => {
    expect(
      resolveVisitEditBlockedReason(
        { is_team_job: false, payout_status: "paid", payout_paid_at: "2026-07-01", payout_id: null },
        batchStatusById,
      ),
    ).toMatch(/already paid/i);
  });
});
