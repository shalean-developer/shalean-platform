import { beforeEach, describe, expect, it, vi } from "vitest";

const dispatchOffersChain = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  gt: vi.fn().mockReturnThis(),
  order: vi.fn().mockReturnThis(),
  limit: vi.fn(() => Promise.resolve({ data: [], error: null })),
};

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({
    from: (t: string) => {
      if (t === "dispatch_offers") return dispatchOffersChain;
      if (t === "bookings") {
        return {
          select: () => ({
            in: () => Promise.resolve({ data: [], error: null }),
          }),
        };
      }
      if (t === "booking_cleaners") {
        return {
          select: () => ({
            eq: () => ({
              in: () => Promise.resolve({ data: [], error: null }),
            }),
          }),
        };
      }
      return dispatchOffersChain;
    },
  }),
}));

vi.mock("@/lib/cleaner/session", () => ({
  resolveCleanerIdFromRequest: async () => ({ cleanerId: "cleaner-1", status: 200 }),
}));

import { GET } from "../route";

describe("GET /api/cleaner/offers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("filters active offers with expires_at > now", async () => {
    const res = await GET(new Request("http://localhost/api/cleaner/offers"));
    expect(res.status).toBe(200);
    expect(dispatchOffersChain.gt).toHaveBeenCalledWith("expires_at", expect.any(String));
    const [, iso] = dispatchOffersChain.gt.mock.calls[0] as [string, string];
    expect(Number.isNaN(Date.parse(iso))).toBe(false);
  });
});
