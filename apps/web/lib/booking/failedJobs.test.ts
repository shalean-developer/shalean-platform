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
});
