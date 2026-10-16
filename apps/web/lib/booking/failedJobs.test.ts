import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: vi.fn(),
}));

vi.mock("@/lib/logging/systemLog", () => ({
  logSystemEvent: vi.fn().mockResolvedValue(undefined),
  reportOperationalIssue: vi.fn().mockResolvedValue(undefined),
}));

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { logSystemEvent } from "@/lib/logging/systemLog";
import { enqueueFailedJob } from "@/lib/booking/failedJobs";

const getSupabaseAdminMock = vi.mocked(getSupabaseAdmin);
const logSystemEventMock = vi.mocked(logSystemEvent);

describe("enqueueFailedJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns false and writes system_logs fallback when admin is missing", async () => {
    getSupabaseAdminMock.mockReturnValue(null as never);
    const ok = await enqueueFailedJob("booking_insert", { paystackReference: "ref-1" });
    expect(ok).toBe(false);
    expect(logSystemEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "enqueueFailedJob/fallback",
        message: expect.stringContaining("[CRITICAL_PAYMENT_FAILURE]"),
      }),
    );
  });

  it("returns false and writes system_logs fallback when insert errors", async () => {
    getSupabaseAdminMock.mockReturnValue({
      from: vi.fn(() => ({
        insert: vi.fn(() => Promise.resolve({ error: { message: "db down", code: "57014" } })),
      })),
    } as never);
    const ok = await enqueueFailedJob("booking_insert", { paystackReference: "ref-2" });
    expect(ok).toBe(false);
    expect(logSystemEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "enqueueFailedJob/fallback",
        message: expect.stringContaining("[CRITICAL_PAYMENT_FAILURE]"),
      }),
    );
  });

  it("returns true on successful insert", async () => {
    getSupabaseAdminMock.mockReturnValue({
      from: vi.fn(() => ({
        insert: vi.fn(() => Promise.resolve({ error: null })),
      })),
    } as never);
    const ok = await enqueueFailedJob("booking_insert", { paystackReference: "ref-3" });
    expect(ok).toBe(true);
  });
  it("uses the atomic confirmation enqueue RPC instead of a raw duplicate-prone insert", async () => {
    const rpc = vi.fn(async () => ({ data: "job-1", error: null })); const from = vi.fn();
    getSupabaseAdminMock.mockReturnValue({ rpc, from } as never);
    const payload = { bookingId: "11111111-1111-4111-8111-111111111111", paymentReference: "bps_test" };
    expect(await enqueueFailedJob("payment_confirmation_notification", payload)).toBe(true);
    expect(rpc).toHaveBeenCalledWith("enqueue_payment_confirmation_notification", { p_payload: payload });
    expect(from).not.toHaveBeenCalled();
  });
});
