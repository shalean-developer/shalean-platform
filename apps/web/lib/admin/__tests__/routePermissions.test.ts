import { describe, expect, it } from "vitest";
import { permissionForOfficePath } from "@/lib/admin/routePermissions";
import { priorityOnePermissionForRequest, priorityPermissionsForRequest } from "@/lib/admin/requireAdmin";

function req(path: string, method = "GET") {
  return new Request(`https://example.test${path}`, { method });
}

describe("permissionForOfficePath", () => {
  it.each([
    ["/office/payouts", "payout.view"],
    ["/office/payouts/batches/123", "payout.view"],
    ["/office/cash-flow", "finance.full.view"],
    ["/office/booking-profitability", "profit.view"],
    ["/office/security/permissions", "role.manage"],
    ["/office/pricing/services", "pricing.manage"],
    ["/office/bookings", "booking.view"],
    ["/office/customers/example", "customer.view"],
  ])("maps %s to %s", (path, permission) => {
    expect(permissionForOfficePath(path)).toBe(permission);
  });

  it("does not invent a permission for an unregistered route", () => {
    expect(permissionForOfficePath("/office/not-a-real-module")).toBeNull();
  });
});

describe("legacy API permission compatibility", () => {
  it("protects critical finance and payout routes", () => {
    expect(priorityOnePermissionForRequest(req("/api/admin/cash-flow"))).toBe("finance.full.view");
    expect(priorityOnePermissionForRequest(req("/api/admin/payouts"))).toBe("payout.view");
    expect(priorityOnePermissionForRequest(req("/api/admin/payouts/approve", "POST"))).toBe("payout.approve");
    expect(priorityOnePermissionForRequest(req("/api/admin/payouts/pay", "POST"))).toBe("payout.release");
  });

  it("allows mixed Customer and Marketing review readers", () => {
    expect(priorityPermissionsForRequest(req("/api/admin/reviews"))).toEqual(["customer.view", "marketing.view"]);
    expect(priorityPermissionsForRequest(req("/api/admin/office-review-funnel"))).toEqual(["customer.view", "marketing.view"]);
  });

  it("maps Marketing APIs away from booking.view", () => {
    expect(priorityPermissionsForRequest(req("/api/admin/blog/posts"))).toEqual([
      "content.draft",
      "content.publish",
      "marketing.view",
    ]);
    for (const path of [
      "/api/admin/campaign-templates",
      "/api/admin/promotions",
      "/api/admin/social-accounts",
      "/api/admin/referrals/campaigns",
    ]) {
      expect(priorityPermissionsForRequest(req(path)), path).toContain("marketing.view");
    }
  });
});
