import { beforeEach, describe, expect, it, vi } from "vitest";

const getSouthAfricanBanksMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    banks: [{ code: "632005", name: "ABSA Bank", active: true }],
    source: "paystack" as const,
    paystackOk: true,
    fetchedAtMs: 1,
    cacheHit: false,
    duplicateCodesDropped: 0,
    inactiveFiltered: 0,
  }),
);

vi.mock("@/lib/paystack/getSouthAfricanBanks", () => ({
  getSouthAfricanBanks: getSouthAfricanBanksMock,
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({}),
}));

vi.mock("@/lib/cleaner/session", () => ({
  resolveCleanerIdFromRequest: async () => ({ cleanerId: "cleaner-1", status: 200 }),
}));

describe("GET /api/paystack/banks", () => {
  beforeEach(() => {
    getSouthAfricanBanksMock.mockClear();
  });

  it("returns banks and meta for authenticated cleaner", async () => {
    const { GET } = await import("@/app/api/paystack/banks/route");
    const res = await GET(new Request("http://localhost/api/paystack/banks"));
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      banks: { code: string; name: string }[];
      meta: { source: string; cacheHit: boolean };
    };
    expect(json.banks).toHaveLength(1);
    expect(json.banks[0]!.code).toBe("632005");
    expect(json.meta.source).toBe("paystack");
    expect(getSouthAfricanBanksMock).toHaveBeenCalled();
  });

  it("passes forceRefresh to helper when query set", async () => {
    const { GET } = await import("@/app/api/paystack/banks/route");
    await GET(new Request("http://localhost/api/paystack/banks?refresh=1"));
    expect(getSouthAfricanBanksMock).toHaveBeenCalledWith({ forceRefresh: true });
  });
});
