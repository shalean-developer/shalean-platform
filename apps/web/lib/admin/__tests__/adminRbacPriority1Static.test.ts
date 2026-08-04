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
    expect(source).not.toContain('.from("user_profiles")');
    expect(source).not.toContain("canAccessFinance");
  });

  it("payout approval has mandatory record-level maker-checker", () => {
    const source = read("lib/payout/approvePayout.ts");
    expect(source).toContain("if (!createdBy)");
    expect(source).toContain("payout preparer is missing");
    expect(source).toContain("the admin who generated this payout cannot also approve it");
    expect(source).toContain("the admin who adjusted the amount cannot also approve it");
    expect(source).not.toContain("PAYOUT_ALLOW_SELF_APPROVE");
    expect(source).not.toContain("PAYOUT_MAKER_CHECKER");
  });

  it("payout release is separate from preparation, adjustment and approval", () => {
    const source = read("lib/payout/paystackPayout.ts");
    expect(source).toContain("created_by");
    expect(source).toContain("amount_adjusted_by");
    expect(source).toContain("approved_by");
    expect(source).toContain("payout preparer or approver is missing");
    expect(source).toContain("createdBy === approvedBy");
    expect(source).toContain("createdBy === params.paidBy || adjustedBy === params.paidBy || approvedBy === params.paidBy");
    expect(source).toContain("did not prepare, adjust, or approve the batch");
    expect(source).not.toContain("PAYOUT_ALLOW_SELF_APPROVE_PAY");
    expect(source).not.toContain("PAYOUT_MAKER_CHECKER");
  });

  it("manual payout completion also enforces maker-checker", () => {
    const route = read("app/api/admin/payouts/[id]/mark-paid/route.ts");
    const service = read("lib/payout/markPayoutPaid.ts");
    expect(route).toContain('requireAdminPermissionFromRequest(request, "payout.release")');
    expect(route).toContain("actorUserId: auth.user.id");
    expect(service).toContain("the admin who prepared this payout cannot also mark it paid");
    expect(service).toContain("the admin who adjusted this payout cannot also mark it paid");
    expect(service).toContain("the admin who approved this payout cannot also mark it paid");
  });

  it("Owner recovery migration verifies critical permissions", () => {
    const source = read("../../supabase/migrations/20260804062000_admin_owner_recovery_account.sql");
    expect(source).toContain("farai@shalean.com");
    expect(source).toContain("role.manage");
    expect(source).toContain("payout.release");
    expect(source).toContain("raise exception");
  });
});
