import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const webRoot = resolve(process.cwd());
function read(path: string): string {
  return readFileSync(resolve(webRoot, path), "utf8");
}

describe("Admin RBAC Priority 4 finance My Work queue", () => {
  it("only loads overdue invoices for finance.full.view", () => {
    const source = read("app/api/admin/my-work/route.ts");
    expect(source).toContain('permissions.has("finance.full.view")');
    expect(source).toContain('.from("monthly_invoices")');
    expect(source).toContain('.eq("is_overdue", true)');
    expect(source).toContain('.eq("is_closed", false)');
    expect(source).toContain('.gt("balance_cents", 0)');
    expect(source).toContain('requiredPermission: "finance.full.view"');
  });

  it("only loads approved unbatched earnings for payout preparers", () => {
    const source = read("app/api/admin/my-work/route.ts");
    expect(source).toContain('permissions.has("payout.prepare")');
    expect(source).toContain('.from("cleaner_earnings")');
    expect(source).toContain('.eq("status", "approved")');
    expect(source).toContain('.is("disbursement_id", null)');
    expect(source).toContain('requiredPermission: "payout.prepare"');
    expect(source).toContain('href: "/office/payouts"');
  });

  it("routes overdue invoices to the existing invoice detail workspace", () => {
    const source = read("app/api/admin/my-work/route.ts");
    expect(source).toContain('href: `/office/invoices/${invoice.id}`');
  });
});
