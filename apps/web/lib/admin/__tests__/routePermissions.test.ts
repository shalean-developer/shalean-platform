import { describe, expect, it } from "vitest";
import { permissionForOfficePath } from "@/lib/admin/routePermissions";
import { priorityPermissionsForRequest } from "@/lib/admin/requireAdmin";

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

describe("priorityPermissionsForRequest", () => {
  it("maps Workforce read APIs to cleaner.view", () => {
    expect(priorityPermissionsForRequest(new Request("https://example.test/api/admin/cleaners"))).toEqual(["cleaner.view"]);
    expect(priorityPermissionsForRequest(new Request("https://example.test/api/admin/cleaner-report-feedback"))).toEqual(["cleaner.view"]);
  });

  it("allows mixed Marketing and customer review readers", () => {
    expect(priorityPermissionsForRequest(new Request("https://example.test/api/admin/reviews"))).toEqual([
      "customer.view",
      "marketing.view",
    ]);
  });

  it("keeps sensitive cleaner resources on dedicated permissions", () => {
    expect(priorityPermissionsForRequest(new Request("https://example.test/api/admin/cleaners/abc/bank"))).toEqual([
      "cleaner.bank.view",
    ]);
    expect(priorityPermissionsForRequest(new Request("https://example.test/api/admin/cleaners/abc/documents"))).toEqual([
      "cleaner.documents.view",
    ]);
  });
});
