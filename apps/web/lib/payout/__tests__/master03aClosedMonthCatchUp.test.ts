import { describe, expect, it } from "vitest";
import { closedCatchUpPayoutPeriods } from "@/lib/payout/generateWeeklyPayouts";
import { fetchAllPayoutRows } from "@/lib/payout/payoutQueryPagination";

describe("MASTER-03A payout catch-up discovery", () => {
  it("paginates discovery until a short page is returned", async () => {
    const calls: Array<[number, number]> = [];
    const rows = Array.from({ length: 1200 }, (_, id) => ({ id }));

    const result = await fetchAllPayoutRows(async (from, to) => {
      calls.push([from, to]);
      return { data: rows.slice(from, to + 1), error: null };
    });

    expect(result).toHaveLength(1200);
    expect(calls).toEqual([
      [0, 499],
      [500, 999],
      [1000, 1499],
    ]);
  });

  it("surfaces a discovery page error instead of returning a truncated set", async () => {
    await expect(
      fetchAllPayoutRows(async (from) =>
        from === 0
          ? { data: Array.from({ length: 500 }, (_, id) => ({ id })), error: null }
          : { data: null, error: { message: "page failed" } },
      ),
    ).rejects.toThrow("page failed");
  });

  it("includes older closed months and excludes the current open month", () => {
    const now = new Date("2026-10-09T12:00:00+02:00");

    expect(
      closedCatchUpPayoutPeriods(
        ["2026-06-01", "2026-08-01", "2026-09-01", "2026-09-01", "2026-10-01"],
        now,
      ),
    ).toEqual([
      { periodStart: "2026-08-01", periodEnd: "2026-08-31" },
      { periodStart: "2026-09-01", periodEnd: "2026-09-30" },
    ]);
  });

  it("does not make the current month eligible at its beginning or middle", () => {
    expect(
      closedCatchUpPayoutPeriods(["2026-09-01"], new Date("2026-09-01T00:01:00+02:00")),
    ).toEqual([]);

    expect(
      closedCatchUpPayoutPeriods(["2026-09-01"], new Date("2026-09-30T23:59:00+02:00")),
    ).toEqual([]);
  });

  it("makes a month eligible immediately after the Johannesburg month closes", () => {
    expect(
      closedCatchUpPayoutPeriods(["2026-09-01"], new Date("2026-10-01T00:01:00+02:00")),
    ).toEqual([{ periodStart: "2026-09-01", periodEnd: "2026-09-30" }]);
  });
});
