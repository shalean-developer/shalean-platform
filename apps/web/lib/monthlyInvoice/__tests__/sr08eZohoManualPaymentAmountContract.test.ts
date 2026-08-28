import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sourcePath = path.resolve(
  process.cwd(),
  "lib/monthlyInvoice/markMonthlyInvoicePaidManual.ts",
);
const source = fs.readFileSync(sourcePath, "utf8");

describe("SR-08E Zoho manual-payment amount contract", () => {
  it("sends Zoho the actual remaining manual EFT amount, not the full invoice total", () => {
    expect(source).toContain("amountZar: remaining / 100");
    expect(source).not.toContain("amountZar: capPaid / 100");
  });
});
