import { describe, expect, it } from "vitest";

import { priorityPermissionsForRequest } from "@/lib/admin/requireAdmin";

describe("invoice registry RBAC mapping", () => {
  it("maps the unified invoice registry to invoice.manage", () => {
    const request = new Request("https://shalean.co.za/api/admin/invoice-registry?page=1", {
      method: "GET",
    });
    expect(priorityPermissionsForRequest(request)).toEqual(["invoice.manage"]);
  });

  it("keeps unknown admin routes fail-closed", () => {
    const request = new Request("https://shalean.co.za/api/admin/not-classified", {
      method: "GET",
    });
    expect(priorityPermissionsForRequest(request)).toEqual([]);
  });
});
