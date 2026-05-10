import { describe, expect, it } from "vitest";
import {
  buildPhase15aClassificationContext,
  classifyPhase15aAnomaly,
  isLegacyCompletedAt,
} from "@/lib/payout/phase15aAnomalyClassification";

const BID = "11111111-1111-4111-8111-111111111111";
const CID = "22222222-2222-4222-8222-222222222222";

describe("classifyPhase15aAnomaly", () => {
  it("classifies ledger_ahead as active_blocker_candidate", () => {
    const ctx = buildPhase15aClassificationContext(
      "ledger_ahead",
      {
        booking_id: BID,
        cleaner_id: CID,
        payout_status: "pending",
        payment_status: "success",
        reason: "x",
        cleaner_earnings_status: "paid",
      },
      { completed_at: "2026-01-01T00:00:00.000Z" },
    );
    expect(classifyPhase15aAnomaly(ctx).classification).toBe("active_blocker_candidate");
  });

  it("classifies claim_shadow as active_blocker_candidate", () => {
    const ctx = buildPhase15aClassificationContext(
      "claim_shadow",
      {
        booking_id: BID,
        cleaner_id: CID,
        payout_status: "eligible",
        payment_status: "success",
        reason: "prepaid_customer_payment_not_settled",
        cleaner_earnings_status: "approved",
      },
      { completed_at: "2026-02-01T00:00:00.000Z" },
    );
    expect(classifyPhase15aAnomaly(ctx).classification).toBe("active_blocker_candidate");
  });

  it("classifies refund signals first as refund_related_candidate", () => {
    const ctx = buildPhase15aClassificationContext(
      "ledger_ahead",
      {
        booking_id: BID,
        cleaner_id: CID,
        payout_status: "pending",
        payment_status: "success",
        reason: "x",
        cleaner_earnings_status: "paid",
      },
      { refunded_at: "2026-01-02T00:00:00.000Z", completed_at: "2026-01-01T00:00:00.000Z" },
    );
    expect(classifyPhase15aAnomaly(ctx).classification).toBe("refund_related_candidate");
  });

  it("classifies batch_authority with eligible payout_status as terminology_mismatch_candidate", () => {
    const ctx = buildPhase15aClassificationContext(
      "batch_authority",
      {
        booking_id: BID,
        cleaner_id: CID,
        payout_status: "eligible",
        payment_status: "success",
        reason: "monthly_payout_status_not_eligible",
        cleaner_earnings_status: null,
      },
      { completed_at: "2026-01-01T00:00:00.000Z" },
    );
    expect(classifyPhase15aAnomaly(ctx).classification).toBe("terminology_mismatch_candidate");
  });

  it("classifies batched_claimable with old completion as legacy_drift_candidate", () => {
    const old = "2020-01-01T00:00:00.000Z";
    expect(isLegacyCompletedAt(old)).toBe(true);
    const ctx = buildPhase15aClassificationContext(
      "batched_claimable",
      {
        booking_id: BID,
        cleaner_id: CID,
        payout_status: "eligible",
        payment_status: "success",
        reason: "batched",
        cleaner_earnings_status: "approved",
      },
      { completed_at: old },
    );
    expect(classifyPhase15aAnomaly(ctx).classification).toBe("legacy_drift_candidate");
  });

  it("classifies missing ids as missing_relation_candidate", () => {
    const ctx = buildPhase15aClassificationContext(
      "ledger_ahead",
      {
        booking_id: "not-a-uuid",
        cleaner_id: CID,
        payout_status: "pending",
        payment_status: "success",
        reason: "x",
        cleaner_earnings_status: "paid",
      },
      {},
    );
    expect(classifyPhase15aAnomaly(ctx).classification).toBe("missing_relation_candidate");
  });
});
