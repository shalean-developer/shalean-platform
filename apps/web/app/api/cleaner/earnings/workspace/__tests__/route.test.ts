import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), load: vi.fn(), admin: {} }));
vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => mocks.admin,
}));
vi.mock("@/lib/cleaner/resolveCleanerFromRequest", () => ({
  resolveCleanerFromRequest: mocks.auth,
}));
vi.mock("@/lib/cleaner/fetchEarningsWorkspace", () => ({
  fetchEarningsWorkspace: mocks.load,
}));
import { GET } from "../route";

describe("cleaner earnings workspace route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({
      ok: true,
      cleaner: { id: "verified-cleaner" },
    });
    mocks.load.mockResolvedValue({ version: 1 });
  });
  it.each([401, 403])(
    "fails closed for status %i before loading earnings",
    async (status) => {
      mocks.auth.mockResolvedValue({
        ok: false,
        status,
        error: "Unauthorized",
      });
      const response = await GET(
        new Request("https://example.test/api/cleaner/earnings/workspace"),
      );
      expect(response.status).toBe(status);
      expect(mocks.load).not.toHaveBeenCalled();
      expect(response.headers.get("cache-control")).toContain("no-store");
    },
  );
  it("binds all reads to the authenticated cleaner and ignores spoofed identities", async () => {
    const response = await GET(
      new Request(
        "https://example.test/api/cleaner/earnings/workspace?month=2026-10&cleaner_id=other",
        { headers: { "x-cleaner-id": "other" } },
      ),
    );
    expect(response.status).toBe(200);
    expect(mocks.load).toHaveBeenCalledWith(
      mocks.admin,
      "verified-cleaner",
      "2026-10",
      expect.any(Date),
    );
    expect(response.headers.get("cache-control")).toContain("private");
  });
  it.each(["2026-13", "not-a-month", "2026-1", "2026-10' OR true"])(
    'rejects invalid month "%s"',
    async (month) => {
      const response = await GET(
        new Request(
          `https://example.test/api/cleaner/earnings/workspace?month=${encodeURIComponent(month)}`,
        ),
      );
      expect(response.status).toBe(400);
      expect(mocks.load).not.toHaveBeenCalled();
    },
  );
  it("does not expose a database failure or return misleading zero totals", async () => {
    mocks.load.mockRejectedValue(new Error("private database detail"));
    const response = await GET(
      new Request("https://example.test/api/cleaner/earnings/workspace"),
    );
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private database detail");
  });
});
