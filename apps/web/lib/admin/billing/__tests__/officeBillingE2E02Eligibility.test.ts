import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("OFFICE-BILLING-E2E-02 booking eligibility", () => {
  it("excludes test and cancelled bookings from Zoho reconciliation backlog", () => {
    const src = readFileSync(
      resolve(process.cwd(), "lib/admin/billing/loadAdminBillingDocuments.ts"),
      "utf8",
    );

    expect(src).toContain("if (row.is_test === true) return false");
    expect(src).toContain('String(row.status ?? "").trim().toLowerCase() === "cancelled"');
    expect(src).toContain('"is_test"');
    expect(src).toContain('"status"');
  });
});
