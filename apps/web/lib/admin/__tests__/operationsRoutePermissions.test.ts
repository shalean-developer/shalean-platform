import { describe, expect, it } from "vitest";
import { priorityPermissionsForRequest } from "@/lib/admin/requireAdmin";

describe("Operations API permission mappings", () => {
  it("maps notification reads and writes explicitly", () => {
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

  it("maps real Office health and incident APIs explicitly", () => {
    expect(priorityPermissionsForRequest(new Request("https://example.test/api/admin/office-ops-health"))).toEqual([
      "ops.health.view",
      "incident.manage",
    ]);
    expect(priorityPermissionsForRequest(new Request("https://example.test/api/admin/office-operations"))).toEqual([
      "ops.health.view",
      "incident.manage",
    ]);
    expect(priorityPermissionsForRequest(new Request("https://example.test/api/admin/ops-snapshot"))).toEqual([
      "ops.health.view",
      "incident.manage",
    ]);
    expect(priorityPermissionsForRequest(new Request("https://example.test/api/admin/sla-breaches"))).toEqual([
      "ops.health.view",
      "incident.manage",
    ]);
    expect(
      priorityPermissionsForRequest(
        new Request("https://example.test/api/admin/office-ops-health", { method: "POST" }),
      ),
    ).toEqual(["incident.manage", "ops.health.view"]);
  });

  it("maps email, template and real dispute APIs explicitly", () => {
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
    expect(priorityPermissionsForRequest(new Request("https://example.test/api/admin/cleaner-earnings-disputes"))).toEqual([
      "dispute.resolve",
    ]);
    expect(
      priorityPermissionsForRequest(
        new Request("https://example.test/api/admin/cleaner-earnings-disputes/123", { method: "PATCH" }),
      ),
    ).toEqual(["dispute.resolve"]);
  });
});
