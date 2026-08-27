import { describe, expect, it } from "vitest";
import { priorityPermissionsForRequest } from "@/lib/admin/requireAdmin";

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

  it("separates membership reads from customer-account mutations", () => {
    expect(priorityPermissionsForRequest(new Request("https://example.test/api/admin/memberships"))).toEqual([
      "marketing.view",
      "customer.view",
    ]);
    expect(
      priorityPermissionsForRequest(
        new Request("https://example.test/api/admin/memberships", { method: "POST" }),
      ),
    ).toEqual(["customer.edit"]);
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
