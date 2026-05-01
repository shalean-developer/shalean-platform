import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/booking/failedJobs", () => ({
  enqueueFailedJob: vi.fn().mockResolvedValue(true),
}));

import { enqueueFailedJob } from "@/lib/booking/failedJobs";
import { enqueuePaystackRecoveryFailedJobs } from "@/lib/booking/enqueuePaystackRecoveryFailedJobs";
import type { UpsertBookingFromPaystackResult } from "@/lib/booking/upsertBookingFromPaystack";

const basePayload = {
  paystackReference: "ref-x",
  amountCents: 100_00,
  currency: "ZAR",
  customerEmail: "a@b.com",
  snapshot: {},
  paystackMetadata: {},
};

describe("enqueuePaystackRecoveryFailedJobs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("enqueues booking_insert only when bookingId is missing", async () => {
    const result: UpsertBookingFromPaystackResult = {
      ok: false,
      skipped: false,
      bookingId: null,
      error: "boom",
    };
    await enqueuePaystackRecoveryFailedJobs({ reference: "ref-x", result, basePayload });
    expect(enqueueFailedJob).toHaveBeenCalledWith("booking_insert", basePayload);
    expect(enqueueFailedJob).toHaveBeenCalledTimes(1);
  });

  it("does not enqueue booking_insert for amount_mismatch with bookingId", async () => {
    const result: UpsertBookingFromPaystackResult = {
      ok: false,
      skipped: true,
      bookingId: "bid-1",
      error: "amount_mismatch",
      reason: "amount_mismatch",
      bookingInDatabase: true,
      recoveryEnqueue: true,
    };
    await enqueuePaystackRecoveryFailedJobs({ reference: "ref-x", result, basePayload });
    expect(enqueueFailedJob).not.toHaveBeenCalledWith("booking_insert", expect.anything());
    expect(enqueueFailedJob).toHaveBeenCalledWith(
      "payment_mismatch",
      expect.objectContaining({ paystackReference: "ref-x", bookingId: "bid-1" }),
    );
  });

  it("enqueues payment_reconciliation on first finalization_failed with recoveryEnqueue", async () => {
    const result: UpsertBookingFromPaystackResult = {
      ok: false,
      skipped: true,
      bookingId: "bid-2",
      error: "finalize threw",
      reason: "finalization_failed",
      bookingInDatabase: true,
      recoveryEnqueue: true,
    };
    await enqueuePaystackRecoveryFailedJobs({ reference: "ref-x", result, basePayload });
    expect(enqueueFailedJob).toHaveBeenCalledWith("payment_reconciliation", basePayload);
  });

  it("does not enqueue recovery jobs on idempotent terminal replay (no recoveryEnqueue)", async () => {
    const result: UpsertBookingFromPaystackResult = {
      ok: false,
      skipped: true,
      bookingId: "bid-1",
      error: "amount_mismatch",
      reason: "amount_mismatch",
      bookingInDatabase: true,
    };
    await enqueuePaystackRecoveryFailedJobs({ reference: "ref-x", result, basePayload });
    expect(enqueueFailedJob).not.toHaveBeenCalled();
  });
});
