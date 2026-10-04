import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

function read(relative: string) {
  return fs.readFileSync(path.join(process.cwd(), relative), "utf8");
}

describe("INV-E2E-03A expense accounting sync relationship", () => {
  const source = read("lib/accounting/syncExpenseToZoho.ts");

  it("uses the expense-owned payment transaction FK explicitly", () => {
    expect(source).toContain(
      "payment_transactions!expenses_payment_transaction_id_fkey ( gateway_reference )",
    );
  });

  it("does not misreport PostgREST relation/query failures as a missing expense", () => {
    expect(source).toContain("error: expenseError");
    expect(source).toContain("expense_query_failed:");
    expect(source).toContain('if (!expense) return { ok: false, error: "expense_not_found" }');
  });
});
