import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadRecordedCleanerPayoutCash } from "../loadRecordedCleanerPayoutCash";

type Row = { id: string; paid_at: string; total_amount_cents: number };
function makeClient(rows: Row[], fail = false) {
  const filters: Array<[string, unknown[]]> = [];
  const q: Record<string, unknown> = {};
  for (const method of ["select", "eq", "gte", "lt", "order"]) {
    q[method] = vi.fn((...args: unknown[]) => { filters.push([method, args]); return q; });
  }
  q.range = vi.fn(async (from: number, to: number) => ({
    data: fail ? null : rows.slice(from, to + 1),
    error: fail ? { message: "payout read failed" } : null,
  }));
  return { admin: { from: () => q } as unknown as SupabaseClient, q, filters };
}

describe("CF-02 cleaner payout money-out date", () => {
  it("counts actual paid batches once by payment date, independent of booking service date", async () => {
    const { admin, filters } = makeClient([
      { id: "p1", paid_at: "2026-11-04T11:00:00Z", total_amount_cents: 12500 },
      { id: "p2", paid_at: "2026-11-05T09:00:00Z", total_amount_cents: 7500 },
    ]);
    const r = await loadRecordedCleanerPayoutCash(admin, "2026-11-04", "2026-11-05");
    expect(r).toEqual({
      paid_cents: 20000,
      by_date: [
        { date: "2026-11-04", cash_out_cents: 12500 },
        { date: "2026-11-05", cash_out_cents: 7500 },
      ],
    });
    expect(filters).toContainEqual(["eq", ["status", "paid"]]);
    expect(filters).toContainEqual(["gte", ["paid_at", "2026-11-03T22:00:00.000Z"]]);
    expect(filters).toContainEqual(["lt", ["paid_at", "2026-11-05T22:00:00.000Z"]]);
  });

  it("includes a near-midnight UTC payout on the correct South African calendar date", async () => {
    const { admin } = makeClient([
      { id: "p1", paid_at: "2026-11-03T22:30:00Z", total_amount_cents: 52500 },
    ]);
    expect(await loadRecordedCleanerPayoutCash(admin, "2026-11-04", "2026-11-04"))
      .toEqual({ paid_cents: 52500, by_date: [{ date: "2026-11-04", cash_out_cents: 52500 }] });
  });

  it("reports zero on an empty forward payout window", async () => {
    const { admin } = makeClient([]);
    expect(await loadRecordedCleanerPayoutCash(admin, "2026-11-04", "2026-11-04"))
      .toEqual({ paid_cents: 0, by_date: [] });
  });

  it("paginates beyond the 500 row limit", async () => {
    const rows = Array.from({ length: 501 }, (_, i) => ({
      id: String(i), paid_at: "2026-11-04T09:00:00Z", total_amount_cents: 100,
    }));
    const { admin, q } = makeClient(rows);
    expect((await loadRecordedCleanerPayoutCash(admin, "2026-11-04", "2026-11-04")).paid_cents).toBe(50100);
    expect(q.range).toHaveBeenCalledWith(0, 499);
    expect(q.range).toHaveBeenCalledWith(500, 999);
  });

  it("rejects duplicate payout ids rather than double counting", async () => {
    const { admin } = makeClient([
      { id: "same", paid_at: "2026-11-04T10:00:00Z", total_amount_cents: 100 },
      { id: "same", paid_at: "2026-11-04T10:00:00Z", total_amount_cents: 100 },
    ]);
    await expect(loadRecordedCleanerPayoutCash(admin, "2026-11-04", "2026-11-04")).rejects.toThrow("Duplicate");
  });

  it("fails closed on a read error", async () => {
    const { admin } = makeClient([], true);
    await expect(loadRecordedCleanerPayoutCash(admin, "2026-11-04", "2026-11-04"))
      .rejects.toThrow("payout read failed");
  });
});
