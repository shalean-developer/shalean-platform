import { describe, expect, it, vi } from "vitest";
import { enqueuePaystackRecoveryFailedJobs } from "@/lib/booking/enqueuePaystackRecoveryFailedJobs";

vi.mock("@/lib/booking/failedJobs", () => ({
  enqueueFailedJob: vi.fn().mockResolvedValue(true),
}));

import { enqueueFailedJob } from "@/lib/booking/failedJobs";

describe("enqueuePaystackRecoveryFailedJobs", () => {
  it("does not enqueue when finalize succeeded and booking exists (including idempotent replay / skipped)", async () => {
    await enqueuePaystackRecoveryFailedJobs({
      reference: "ref-1",
      result: {
        ok: true,
        skipped: true,
        bookingId: "00000000-0000-4000-8000-000000000001",
        bookingInDatabase: true,
      },
      basePayload: {
        paystackReference: "ref-1",
        amountCents: 100,
        currency: "ZAR",
        customerEmail: "a@b.com",
        snapshot: null,
        paystackMetadata: {},
      },
    });
    expect(enqueueFailedJob).not.toHaveBeenCalled();
  });
});
