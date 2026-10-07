import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/booking/failedJobs", () => ({
  enqueueFailedJob: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/lib/logging/systemLog", () => ({
  reportOperationalIssue: vi.fn().mockResolvedValue(undefined),
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

  it("enqueues payment_mismatch for currency_mismatch with recoveryEnqueue", async () => {
    const result: UpsertBookingFromPaystackResult = {
      ok: false,
      skipped: true,
      bookingId: "bid-cur",
      error: "currency_mismatch",
      reason: "currency_mismatch",
      bookingInDatabase: true,
      recoveryEnqueue: true,
    };
    await enqueuePaystackRecoveryFailedJobs({ reference: "ref-x", result, basePayload });
    expect(enqueueFailedJob).toHaveBeenCalledWith(
      "payment_mismatch",
      expect.objectContaining({ bookingId: "bid-cur", currency: "ZAR" }),
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

  it("throws when payment reconciliation recovery cannot be durably enqueued", async () => {
    vi.mocked(enqueueFailedJob).mockResolvedValueOnce(false);
    const result: UpsertBookingFromPaystackResult = {
      ok: false,
      skipped: true,
      bookingId: "bid-conflict",
      error: "Pending booking changed during payment finalization.",
      code: "PAYMENT_FINALIZATION_CONFLICT",
      reason: "finalization_failed",
      bookingInDatabase: true,
      recoveryEnqueue: true,
    };

    await expect(
      enqueuePaystackRecoveryFailedJobs({ reference: "ref-x", result, basePayload }),
    ).rejects.toThrow("recovery_payment_reconciliation_enqueue_failed");
  });

  it("enqueues payment_reconciliation for a retryable finalization conflict", async () => {
    const result: UpsertBookingFromPaystackResult = {
      ok: false,
      skipped: true,
      bookingId: "bid-conflict",
      error: "Pending booking changed during payment finalization.",
      code: "PAYMENT_FINALIZATION_CONFLICT",
      reason: "finalization_failed",
      bookingInDatabase: true,
      recoveryEnqueue: true,
    };
    await enqueuePaystackRecoveryFailedJobs({ reference: "ref-x", result, basePayload });
    expect(enqueueFailedJob).toHaveBeenCalledWith("payment_reconciliation", basePayload);
    expect(enqueueFailedJob).not.toHaveBeenCalledWith("booking_insert", expect.anything());
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
