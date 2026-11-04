import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  loadRecordedExpenseCash,
  summarizeRecordedExpenseCash,
  type CashOutExpenseRow,
} from "../loadRecordedExpenseCash";

function expense(patch: Partial<CashOutExpenseRow> = {}): CashOutExpenseRow {
  return {
    id: "ordinary", expense_date: "2026-11-04", amount_cents: 10000,
    payment_transaction_id: null, expense_categories: { name: "Cleaning Supplies" },
    payment_transactions: null, ...patch,
  };
}
function client(rows: CashOutExpenseRow[], fail = false) {
  const filters: Array<[string, unknown[]]> = [];
  const query: Record<string, unknown> = {};
  for (const method of ["select", "eq", "gte", "lte", "order"]) {
    query[method] = vi.fn((...args: unknown[]) => {
      filters.push([method, args]); return query;
    });
  }
  query.range = vi.fn(async (from: number, to: number) => ({
    data: fail ? null : rows.slice(from, to + 1),
    error: fail ? { message: "expense query failed" } : null,
  }));
  return { admin: { from: () => query } as unknown as SupabaseClient, query, filters };
}

describe("CF-02 Cash Flow approved expenses vs Paystack settlement fees", () => {
  it("excludes only a verified Paystack-linked processing fee, avoiding double deduction", () => {
    const result = summarizeRecordedExpenseCash([
      expense(),
      expense({
        id: "paystack-fee", amount_cents: 3000,
        payment_transaction_id: "provider-transaction",
        expense_categories: { name: "Paystack Fees" },
        payment_transactions: { gateway: "paystack" },
      }),
    ]);
    expect(result).toEqual({
      cash_out_cents: 10000,
      excluded_paystack_fees_cents: 3000,
      by_date: [{ date: "2026-11-04", cash_out_cents: 10000 }],
    });
    // Example: R1,000 gross less R30 provider fee gives R970 settlement.
    // R100 independent operating cost leaves R870; no second R30 deduction.
    expect(97000 - result.cash_out_cents).toBe(87000);
  });

  it("retains unrelated bank-paid fees, unlinked fees and normal operating expenses", () => {
    const result = summarizeRecordedExpenseCash([
      expense(),
      expense({ id: "bank-fee", amount_cents: 2500, expense_categories: { name: "Bank Fees" } }),
      expense({ id: "unlinked-paystack-fee", amount_cents: 500,
        expense_categories: { name: "Paystack Fees" }, payment_transaction_id: null }),
      expense({ id: "other-gateway-fee", amount_cents: 200,
        expense_categories: { name: "Paystack Fees" }, payment_transaction_id: "other",
        payment_transactions: { gateway: "other" } }),
    ]);
    expect(result.cash_out_cents).toBe(13200);
    expect(result.excluded_paystack_fees_cents).toBe(0);
  });

  it("provides date groups whose sum agrees exactly with the Money paid KPI", () => {
    const result = summarizeRecordedExpenseCash([
      expense(),
      expense({ id: "next", expense_date: "2026-11-05", amount_cents: 5000 }),
      expense({ id: "fee", expense_date: "2026-11-05", amount_cents: 300,
        expense_categories: { name: "Paystack Fees" }, payment_transaction_id: "x",
        payment_transactions: { gateway: "paystack" } }),
    ]);
    expect(result.by_date).toEqual([
      { date: "2026-11-04", cash_out_cents: 10000 },
      { date: "2026-11-05", cash_out_cents: 5000 },
    ]);
    expect(result.by_date.reduce((s, d) => s + d.cash_out_cents, 0)).toBe(result.cash_out_cents);
  });

  it("returns a valid empty result when no forward expense records exist", () => {
    expect(summarizeRecordedExpenseCash([])).toEqual({
      cash_out_cents: 0, excluded_paystack_fees_cents: 0, by_date: [],
    });
  });

  it("rejects duplicate expenses and invalid amounts rather than misreporting cash", () => {
    expect(() => summarizeRecordedExpenseCash([expense(), expense()])).toThrow("Duplicate");
    expect(() => summarizeRecordedExpenseCash([expense({ amount_cents: -1 })])).toThrow("Invalid");
  });

  it("queries only approved expenses in the selected dates, paginating past 500 rows", async () => {
    const rows = Array.from({ length: 501 }, (_, i) => expense({ id: String(i), amount_cents: 100 }));
    const { admin, filters, query } = client(rows);
    const result = await loadRecordedExpenseCash(admin, "2026-11-04", "2026-11-05");
    expect(result.cash_out_cents).toBe(50100);
    expect(filters).toContainEqual(["eq", ["status", "approved"]]);
    expect(filters).toContainEqual(["gte", ["expense_date", "2026-11-04"]]);
    expect(filters).toContainEqual(["lte", ["expense_date", "2026-11-05"]]);
    expect(query.range).toHaveBeenCalledWith(0, 499);
    expect(query.range).toHaveBeenCalledWith(500, 999);
  });

  it("fails closed on a database query error", async () => {
    const { admin } = client([], true);
    await expect(loadRecordedExpenseCash(admin, "2026-11-04", "2026-11-04"))
      .rejects.toThrow("expense query failed");
  });
});
