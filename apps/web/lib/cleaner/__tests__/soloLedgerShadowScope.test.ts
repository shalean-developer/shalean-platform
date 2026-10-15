import { describe, expect, it, vi } from "vitest";
import { fetchMemberRailBookingIds } from "@/lib/cleaner/soloLedgerShadowScope";

function client(pages: Array<{ data: unknown[] | null; error: { message: string } | null }>) {
  const range = vi.fn().mockImplementation(async () => pages.shift() ?? { data: [], error: null });
  const query = { select: () => query, in: () => query, order: () => query, range };
  return { admin: { from: () => query } as unknown as Parameters<typeof fetchMemberRailBookingIds>[0], range };
}

describe("solo ledger shadow scope", () => {
  it("counts distinct participants across pages and excludes formal teams", async () => {
    const { admin, range } = client([
      { data: Array.from({ length: 500 }, (_, i) => ({ id: i, booking_id: "pair", cleaner_id: "a" })), error: null },
      { data: [{ booking_id: "pair", cleaner_id: "b" }, { booking_id: "solo", cleaner_id: "a" },
        { booking_id: "solo", cleaner_id: "a" }, { booking_id: "solo", cleaner_id: null }], error: null },
    ]);
    expect(await fetchMemberRailBookingIds(admin, [{ id: "pair" }, { id: "solo" }, { id: "team", is_team_job: true }]))
      .toEqual(new Set(["pair", "team"]));
    expect(range).toHaveBeenNthCalledWith(2, 500, 999);
  });

  it("does not classify failed roster reads as solo", async () => {
    const { admin } = client([{ data: null, error: { message: "roster unavailable" } }]);
    await expect(fetchMemberRailBookingIds(admin, [{ id: "pair" }])).rejects.toThrow("roster unavailable");
  });
});
