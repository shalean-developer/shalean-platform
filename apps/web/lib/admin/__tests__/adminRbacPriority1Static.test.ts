import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const webRoot = resolve(process.cwd());
function read(path: string): string {
  return readFileSync(resolve(webRoot, path), "utf8");
}

describe("Admin RBAC Priority 1 static contracts", () => {
  it("finance APIs use granular deny-by-default RBAC", () => {
    const source = read("lib/auth/requireFinanceApi.ts");
    expect(source).toContain('requireAdminPermissionFromRequest(request, "finance.full.view")');
    expect(source).not.toContain("FINANCE_EMAILS");
    expect(source).not.toContain("finance_access");
    expect(source).not.toContain("canAccessFinance");
  });

  it("payout approval has mandatory record-level maker-checker", () => {
    const source = read("lib/payout/approvePayout.ts");
    expect(source).toContain("Payout preparer identity is missing");
    expect(source).toContain("the admin who generated this payout cannot also approve it");
    expect(source).toContain("the admin who adjusted the amount cannot also approve it");
    expect(source).not.toContain("PAYOUT_ALLOW_SELF_APPROVE");
    expect(source).not.toContain("PAYOUT_MAKER_CHECKER");
  });

  it("payout release is separate from preparation, adjustment and approval", () => {
    const source = read("lib/payout/paystackPayout.ts");
    expect(source).toContain("Payout preparer identity is missing");
    expect(source).toContain("Payout approver identity is missing");
    expect(source).toContain("the admin who prepared this payout cannot also release it");
    expect(source).toContain("the admin who adjusted this payout cannot also release it");
    expect(source).toContain("the admin who approved this payout cannot also initiate payment");
    expect(source).not.toContain("PAYOUT_ALLOW_SELF_APPROVE_PAY");
    expect(source).not.toContain("PAYOUT_MAKER_CHECKER");
  });

  it("Owner recovery migration verifies critical permissions", () => {
    const source = read("../../supabase/migrations/20260804062000_admin_owner_recovery_account.sql");
    expect(source).toContain("farai@shalean.com");
    expect(source).toContain("role.manage");
    expect(source).toContain("payout.release");
    expect(source).toContain("raise exception");
  });
});
