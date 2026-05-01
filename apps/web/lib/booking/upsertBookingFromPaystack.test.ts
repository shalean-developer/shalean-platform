import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: vi.fn(),
}));

vi.mock("@/lib/booking/failedJobs", () => ({
  enqueueFailedJob: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/lib/logging/systemLog", () => ({
  logSystemEvent: vi.fn().mockResolvedValue(undefined),
  reportOperationalIssue: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/observability/recordSystemMetric", () => ({
  recordSystemMetric: vi.fn().mockResolvedValue(undefined),
}));

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { upsertBookingFromPaystack } from "@/lib/booking/upsertBookingFromPaystack";

const getSupabaseAdminMock = vi.mocked(getSupabaseAdmin);

function bookingSelectOnce(data: unknown, error: { message: string } | null = null) {
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({ data, error })),
        })),
      })),
    })),
  };
}

describe("upsertBookingFromPaystack", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws if price snapshot missing", async () => {
    getSupabaseAdminMock.mockReturnValue(
      bookingSelectOnce(null) as unknown as ReturnType<typeof getSupabaseAdmin>,
    );
    await expect(
      upsertBookingFromPaystack({
        paystackReference: "ref-missing-snap",
        amountCents: 10_000,
        currency: "ZAR",
        customerEmail: "a@b.co",
        snapshot: { locked: { locked: true, lockedAt: new Date().toISOString() } } as never,
        paystackMetadata: {},
      }),
    ).rejects.toThrow(/Missing price snapshot/i);
  });

  it("returns skipped if booking already finalized (non pending_payment)", async () => {
    getSupabaseAdminMock.mockReturnValue(
      bookingSelectOnce({
        id: "00000000-0000-4000-8000-000000000001",
        status: "pending",
        is_recurring_generated: false,
        price_snapshot: null,
      }) as unknown as ReturnType<typeof getSupabaseAdmin>,
    );
    const result = await upsertBookingFromPaystack({
      paystackReference: "ref-already-paid",
      amountCents: 10_000,
      currency: "ZAR",
      customerEmail: "a@b.co",
      snapshot: null,
      paystackMetadata: {},
    });
    expect(result.skipped).toBe(true);
    expect(result.ok).toBe(true);
    expect(result.bookingId).toBe("00000000-0000-4000-8000-000000000001");
  });
});
