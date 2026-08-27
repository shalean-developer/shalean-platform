import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { priorityPermissionsForRequest } from "@/lib/admin/requireAdmin";

const membershipsRoute = fs.readFileSync(
  path.join(process.cwd(), "app/api/admin/memberships/route.ts"),
  "utf8",
);

describe("SR-05B2B marketing and communications RBAC alignment", () => {
  it("keeps templates, promotions and notification retries on their approved mappings", () => {
    expect(priorityPermissionsForRequest(new Request("https://example.test/api/admin/templates"))).toEqual([
      "template.manage",
    ]);
    expect(
      priorityPermissionsForRequest(
        new Request("https://example.test/api/admin/promotions/abc", { method: "PATCH" }),
      ),
    ).toEqual(["content.draft", "content.publish"]);
    expect(
      priorityPermissionsForRequest(
        new Request("https://example.test/api/admin/notifications/retry", { method: "POST" }),
      ),
    ).toEqual(["notification.send"]);
  });

  it("treats GSC data refresh as SEO read authority instead of content publishing", () => {
    expect(
      priorityPermissionsForRequest(
        new Request("https://example.test/api/admin/seo/gsc-sync", { method: "POST" }),
      ),
    ).toEqual(["marketing.view"]);
  });

  it("keeps membership reads centralized and splits plan from customer mutations", () => {
    expect(priorityPermissionsForRequest(new Request("https://example.test/api/admin/memberships"))).toEqual([
      "marketing.view",
      "customer.view",
    ]);

    expect(membershipsRoute).toContain("requireAdminPermissionFromRequest(request, requiredPermission)");
    expect(membershipsRoute).toContain('action === "create_plan" || action === "update_plan"');
    expect(membershipsRoute).toContain('? "content.publish"');
    expect(membershipsRoute).toContain(
      'action === "assign_membership" || action === "set_membership_status"',
    );
    expect(membershipsRoute).toContain('? "customer.edit"');
  });

  it("requires publishing authority to change referral programme settings", () => {
    expect(
      priorityPermissionsForRequest(new Request("https://example.test/api/admin/referrals/settings")),
    ).toEqual(["marketing.view"]);
    expect(
      priorityPermissionsForRequest(
        new Request("https://example.test/api/admin/referrals/settings", { method: "PATCH" }),
      ),
    ).toEqual(["content.publish"]);
  });
});
