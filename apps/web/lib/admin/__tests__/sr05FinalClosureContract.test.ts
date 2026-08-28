import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  OFFICE_POLICY_EXEMPT_PATHS,
  policyForOfficePath,
} from "@/lib/admin/officeExperience";
import { priorityPermissionsForRequest } from "@/lib/admin/requireAdmin";

function source(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");
}

describe("SR-05 final Office RBAC closure", () => {
  it("keeps Office fail-closed with only the root page exempt", () => {
    expect(OFFICE_POLICY_EXEMPT_PATHS).toEqual(["/office"]);
    expect(policyForOfficePath("/office/customer-care")).not.toBeNull();
    expect(policyForOfficePath("/office/workforce/training")).not.toBeNull();
    expect(policyForOfficePath("/office/payment-reconciliation")).toMatchObject({
      anyOf: ["payment.reconcile"],
    });
    expect(policyForOfficePath("/office/disputes")).toMatchObject({
      anyOf: ["dispute.resolve"],
    });
  });

  it("preserves centralized operational, customer-care, workforce and marketing mappings", () => {
    expect(priorityPermissionsForRequest(new Request("https://example.test/api/admin/customer-care-cases"))).toEqual([
      "customer.view",
      "customer.contact",
      "incident.manage",
    ]);
    expect(priorityPermissionsForRequest(new Request("https://example.test/api/admin/workforce/training-compliance"))).toEqual([
      "cleaner.view",
      "cleaner.documents.view",
      "incident.manage",
    ]);
    expect(priorityPermissionsForRequest(new Request("https://example.test/api/admin/inventory"))).toEqual([
      "expense.manage",
      "booking.assign",
      "finance.full.view",
    ]);
    expect(priorityPermissionsForRequest(new Request("https://example.test/api/admin/transport"))).toEqual([
      "booking.assign",
      "booking.view",
      "expense.manage",
      "finance.full.view",
    ]);
    expect(priorityPermissionsForRequest(new Request("https://example.test/api/admin/seo/gsc-sync", { method: "POST" }))).toEqual([
      "marketing.view",
    ]);
  });

  it("keeps finance reconciliation and dispute adjustments on explicit stronger authority", () => {
    const reconciliation = source("../../../app/api/admin/payment-reconciliation/route.ts");
    const backfill = source("../../../app/api/admin/payments/backfill-paystack/route.ts");
    const dispute = source("../../../app/api/admin/cleaner-earnings-disputes/[id]/route.ts");

    expect(reconciliation).toContain('requireAdminApi(request, ["payment.reconcile"])');
    expect(backfill).toContain('requireAdminApi(request, ["payment.reconcile"])');
    expect(dispute).toContain('requireAdminApi(request, ["payout.prepare"])');
    expect(dispute.indexOf('requireAdminApi(request, ["payout.prepare"])')).toBeLessThan(
      dispute.indexOf('getSupabaseAdmin()'),
    );
  });

  it("preserves payout maker-checker and release separation", () => {
    const approveRoute = source("../../../app/api/admin/payouts/[id]/approve/route.ts");
    const payRoute = source("../../../app/api/admin/payouts/[id]/pay/route.ts");
    const approvePayout = source("../../../lib/payout/approvePayout.ts");

    expect(approveRoute).toContain('requireAdminPermissionFromRequest(request, "payout.approve")');
    expect(payRoute).toContain('requireAdminPermissionFromRequest(request, "payout.release")');
    expect(approvePayout).toContain("createdBy === params.approvedBy");
    expect(approvePayout).toContain("adjustedBy === params.approvedBy");
  });
});
