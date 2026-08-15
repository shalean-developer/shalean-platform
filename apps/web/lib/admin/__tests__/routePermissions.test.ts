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

  it("maps the full Pricing API family to pricing.manage", () => {
    for (const [path, method] of [
      ["/api/admin/pricing-services", "GET"],
      ["/api/admin/pricing-services", "PATCH"],
      ["/api/admin/pricing-extras", "GET"],
      ["/api/admin/pricing-extras", "POST"],
      ["/api/admin/pricing-booking-config", "GET"],
      ["/api/admin/pricing-booking-config", "PATCH"],
      ["/api/admin/pricing-catalog-audit", "GET"],
    ] as const) {
      expect(priorityPermissionsForRequest(new Request(`https://example.test${path}`, { method }))).toEqual([
        "pricing.manage",
      ]);
    }
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

  it("does not allow finance read access to reject money proposals", () => {
    expect(
      priorityPermissionsForRequest(
        new Request("https://example.test/api/admin/money-action-proposals/abc/reject", { method: "POST" }),
      ),
    ).toEqual(["payout.approve"]);
  });

  it("preserves incident-manager access to customer-care mutations", () => {
    expect(
      priorityPermissionsForRequest(
        new Request("https://example.test/api/admin/customer-care-cases/abc", { method: "PATCH" }),
      ),
    ).toEqual(["customer.contact", "incident.manage"]);
  });

  it("requires incident.manage for operational mutations", () => {
    expect(
      priorityPermissionsForRequest(
        new Request("https://example.test/api/admin/ops-queue/abc", { method: "POST" }),
      ),
    ).toEqual(["incident.manage"]);
  });

  it("allows draft marketing writes without granting read-only mutation access", () => {
    expect(
      priorityPermissionsForRequest(
        new Request("https://example.test/api/admin/promotions/abc", { method: "PATCH" }),
      ),
    ).toEqual(["content.draft", "content.publish"]);
    expect(
      priorityPermissionsForRequest(
        new Request("https://example.test/api/admin/seo/recommendations/abc", { method: "POST" }),
      ),
    ).toEqual(["content.draft", "content.publish"]);
    expect(
      priorityPermissionsForRequest(
        new Request("https://example.test/api/admin/promotions/abc/publish", { method: "POST" }),
      ),
    ).toEqual(["content.publish"]);
  });

  it("requires customer.contact for review mutations", () => {
    expect(
      priorityPermissionsForRequest(
        new Request("https://example.test/api/admin/reviews/abc", { method: "POST" }),
      ),
    ).toEqual(["customer.contact"]);
  });
});
