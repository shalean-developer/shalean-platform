import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const repairPath = path.join(
  process.cwd(),
  "lib/accounting/invE2e01dTargetedRepair.ts",
);

describe("INV-E2E-01H targeted repair correction", () => {
  const source = fs.readFileSync(repairPath, "utf8");

  it("does not select the non-existent bookings.user_id column", () => {
    expect(source).not.toContain("customer_id, user_id, customer_email");
    expect(source).toContain("id, customer_id, customer_email");
  });

  it("caps every Zoho payment reference at 50 characters", () => {
    expect(source).toContain("export function zohoSafePaymentReference");
    expect(source).toContain("return raw.slice(0, 50)");
    expect(source.match(/reference: zohoSafePaymentReference/g)?.length).toBeGreaterThanOrEqual(3);
  });

  it("creates the historical sales invoice with a non-inverted date range", () => {
    expect(source).toContain("const invoiceDate = ymdJhb(data.created_at ?? tx.paid_at)");
    expect(source).toContain("storedDueDate >= invoiceDate");
    expect(source).toContain('orderKind: "sales"');
    expect(source).not.toContain("syncSalesDocumentToZoho(admin, id)");
  });
});
