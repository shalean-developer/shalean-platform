import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadRecordedSettlementsByDate } from "../loadRecordedSettlementsByDate";

type Row = { id: string; settlement_date: string; net_settlement_cents: number | null; amount_cents: number };

function mockClient(rows: Row[]) {
  const filters: Array<[string, unknown]> = [];
  const query: Record<string, unknown> = {};
  for (const method of ["select", "eq", "gte", "lte", "order"]) {
    query[method] = vi.fn((...args: unknown[]) => {
      filters.push([method, args]);
      return query;
    });
  }
  query.range = vi.fn(async (from: number, to: number) => ({
    data: rows.slice(from, to + 1),
    error: null,
  }));
  return { admin: { from: () => query } as unknown as SupabaseClient, filters, query };
}

describe("CF-02 Paystack settlement-date accounting", () => {
  it("includes a prior-day customer payment that settles in the selected day, without filtering paid_at", async () => {
    // An Oct/Nov historical charge settling after the cutoff is a boundary
    // TEST ONLY. No actual historical transaction is changed.
    const client = mockClient([
      { id: "p1", settlement_date: "2026-11-04", net_settlement_cents: 731829, amount_cents: 750000 },
      { id: "p2", settlement_date: "2026-11-04", net_settlement_cents: 10000, amount_cents: 10100 },
    ]);
    const result = await loadRecordedSettlementsByDate(client.admin, "2026-11-04", "2026-11-04");
    expect(result.settled_to_bank_cents).toBe(741829);
    expect(result.by_date).toEqual([{ date: "2026-11-04", cash_in_cents: 741829 }]);
    expect(client.filters).toContainEqual(["gte", ["settlement_date", "2026-11-04"]]);
    expect(client.filters).toContainEqual(["lte", ["settlement_date", "2026-11-04"]]);
    expect(client.filters).toContainEqual(["eq", ["settlement_status", "settled"]]);
    expect(client.filters).toContainEqual(["eq", ["gateway", "paystack"]]);
    expect(client.filters.some(([method, args]) => ["gte", "lte"].includes(method) && (args as string[])[0] === "paid_at")).toBe(false);
  });

  it("uses the same selected cash inflows for the KPI and daily chart, grouped by settlement day", async () => {
    const client = mockClient([
      { id: "p1", settlement_date: "2026-11-04", net_settlement_cents: 20000, amount_cents: 21000 },
      { id: "p2", settlement_date: "2026-11-05", net_settlement_cents: 30000, amount_cents: 31000 },
      { id: "p3", settlement_date: "2026-11-05", net_settlement_cents: 12000, amount_cents: 13000 },
    ]);
    const result = await loadRecordedSettlementsByDate(client.admin, "2026-11-04", "2026-11-05");
    expect(result.by_date).toEqual([
      { date: "2026-11-04", cash_in_cents: 20000 },
      { date: "2026-11-05", cash_in_cents: 42000 },
    ]);
    expect(result.settled_to_bank_cents).toBe(62000);
    expect(result.by_date.reduce((sum, row) => sum + row.cash_in_cents, 0))
      .toBe(result.settled_to_bank_cents);
  });

  it("returns zero for an empty forward settlement period rather than inventing bank deposits", async () => {
    const client = mockClient([]);
    expect(await loadRecordedSettlementsByDate(client.admin, "2026-11-04", "2026-11-04"))
      .toEqual({ settled_to_bank_cents: 0, by_date: [] });
  });

  it("paginates settled records beyond the default 500-row query limit", async () => {
    const rows = Array.from({ length: 501 }, (_, i) => ({
      id: String(i), settlement_date: "2026-11-04", net_settlement_cents: 100, amount_cents: 120,
    }));
    const client = mockClient(rows);
    const result = await loadRecordedSettlementsByDate(client.admin, "2026-11-04", "2026-11-04");
    expect(result.settled_to_bank_cents).toBe(50100);
    expect(client.query.range).toHaveBeenCalledWith(0, 499);
    expect(client.query.range).toHaveBeenCalledWith(500, 999);
  });

  it("fails closed if the settlement ledger query fails", async () => {
    const client = mockClient([]);
    client.query.range = vi.fn(async () => ({ data: null, error: { message: "settlement database unavailable" } }));
    await expect(loadRecordedSettlementsByDate(client.admin, "2026-11-04", "2026-11-04"))
      .rejects.toThrow("settlement database unavailable");
  });
});
