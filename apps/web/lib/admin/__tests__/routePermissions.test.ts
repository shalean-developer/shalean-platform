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

  it("maps Owner Command Centre API to role.manage", () => {
    expect(priorityPermissionsForRequest(new Request("https://example.test/api/admin/owner-command-centre"))).toEqual([
      "role.manage",
    ]);
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

  it("maps Operations notification reads and writes explicitly", () => {
    expect(priorityPermissionsForRequest(new Request("https://example.test/api/admin/office-notifications"))).toEqual([
      "system.notifications",
      "notification.send",
      "system.logs",
    ]);
    expect(
      priorityPermissionsForRequest(
        new Request("https://example.test/api/admin/notifications/retry", { method: "POST" }),
      ),
    ).toEqual(["notification.send"]);
  });

  it("maps Operations health and incident APIs explicitly", () => {
    expect(priorityPermissionsForRequest(new Request("https://example.test/api/admin/ops-health"))).toEqual([
      "ops.health.view",
      "incident.manage",
    ]);
    expect(priorityPermissionsForRequest(new Request("https://example.test/api/admin/sla-breaches"))).toEqual([
      "ops.health.view",
      "incident.manage",
    ]);
    expect(
      priorityPermissionsForRequest(
        new Request("https://example.test/api/admin/ops-health", { method: "POST" }),
      ),
    ).toEqual(["incident.manage", "ops.health.view"]);
  });

  it("maps Operations email, template and dispute APIs explicitly", () => {
    expect(priorityPermissionsForRequest(new Request("https://example.test/api/admin/email-operations"))).toEqual([
      "system.notifications",
      "notification.send",
    ]);
    expect(priorityPermissionsForRequest(new Request("https://example.test/api/admin/lifecycle-emails"))).toEqual([
      "notification.send",
      "template.manage",
    ]);
    expect(priorityPermissionsForRequest(new Request("https://example.test/api/admin/templates"))).toEqual([
      "template.manage",
    ]);
    expect(priorityPermissionsForRequest(new Request("https://example.test/api/admin/disputes"))).toEqual([
      "dispute.resolve",
    ]);
  });
});