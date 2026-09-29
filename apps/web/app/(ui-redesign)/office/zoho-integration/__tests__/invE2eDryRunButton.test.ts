import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const pagePath = path.join(
  process.cwd(),
  "app/(ui-redesign)/office/zoho-integration/page.tsx",
);

describe("INV-E2E dry-run button", () => {
  const source = fs.readFileSync(pagePath, "utf8");

  it("calls only the protected read-only dry-run endpoint", () => {
    expect(source).toContain('"/api/admin/inv-e2e-01d/zoho-repair-dry-run"');
    expect(source).toContain("Run INV-E2E dry run");
    expect(source).toContain("Read-only audit. No Zoho or Supabase writes were performed.");
  });

  it("does not replace or auto-trigger the real sync action", () => {
    expect(source).toContain('adminFetch("/api/admin/zoho-integration", { method: "POST" })');
    expect(source).toContain("Run sync now");
    expect(source.replace(/\\s+/g, " ")).not.toContain("runRepairDryRun() runSync(");
  });

  it("allows guarded resume when the full allowlist is either new or already linked", () => {
    expect(source).toContain(
      "dryRun.create_and_pay_count + dryRun.already_linked_review_count === 10",
    );
    expect(source).toContain("Ready to repair");
    expect(source).toContain("create or resume payment for the 10 audited Zoho invoices");
  });
});
