import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("INV-E2E-03F accounting cron timeout contract", () => {
  it("uses a small queue batch and skips invoice-status polling in the cron route", () => {
    const route = readFileSync(
      resolve(process.cwd(), "app/api/cron/accounting-sync/route.ts"),
      "utf8",
    );
    expect(route).toContain("processAccountingSyncQueue(admin, 10, 0)");
  });

  it("keeps invoice-status polling available outside the cron fast path", () => {
    const worker = readFileSync(
      resolve(process.cwd(), "lib/accounting/processAccountingSyncQueue.ts"),
      "utf8",
    );
    expect(worker).toContain("invoiceStatusLimit = 5");
    expect(worker).toContain("invoiceStatusLimit > 0");
    expect(worker).toContain("syncInvoiceStatusesFromZoho(admin, invoiceStatusLimit)");
  });
});
