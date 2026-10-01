import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("monthly Zoho payment metadata refresh", () => {
  it("refreshes accounting invoice metadata after monthly payment sync", () => {
    const src = readFileSync(
      join(root, "lib/accounting/processAccountingSyncQueue.ts"),
      "utf8",
    );

    expect(src).toContain("refreshInvoiceStatusFromZoho");
    expect(src).toContain('refreshInvoiceStatusFromZoho(admin, "monthly_invoice", pt.entity_id, zohoInvoiceId)');
  });

  it("also refreshes metadata when an already-synced monthly payment is replayed", () => {
    const src = readFileSync(
      join(root, "lib/accounting/processAccountingSyncQueue.ts"),
      "utf8",
    );

    expect(src).toContain('pt.external_accounting_id && pt.sync_status === "synced"');
    expect(src).toContain('.select("zoho_invoice_id")');
  });
});
