import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: vi.fn(),
}));

vi.mock("@/lib/pricing/buildPricingRatesSnapshotFromDb", () => ({
  buildPricingRatesSnapshotFromDb: vi.fn().mockResolvedValue(null),
}));

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { runBookingLockValidation } from "@/lib/booking/runBookingLockValidation";

const getSupabaseAdminMock = vi.mocked(getSupabaseAdmin);

describe("runBookingLockValidation", () => {
  it("returns invalid when bookings overlap query fails", async () => {
    const cleanerId = "00000000-0000-4000-8000-000000000001";
    getSupabaseAdminMock.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "cleaners") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({ data: { id: cleanerId }, error: null })),
              })),
            })),
          };
        }
        if (table === "bookings") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                in: vi.fn(() => ({
                  error: { message: "timeout" },
                })),
              })),
            })),
          };
        }
        throw new Error(`unexpected table ${table}`);
      }),
    } as never);

    const res = await runBookingLockValidation({
      locked: {
        date: "2026-06-01",
        time: "09:00",
        rooms: 2,
        bathrooms: 1,
        service: "standard",
        extras: [],
        cleaner_id: cleanerId,
      },
    });
    expect(res.valid).toBe(false);
    if (!res.valid) {
      expect(res.reason).toBe("availability_check_failed");
      expect(res.httpStatus).toBe(503);
    }
  });
});
