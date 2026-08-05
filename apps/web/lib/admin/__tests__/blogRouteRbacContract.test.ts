import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const routePath = path.join(
  process.cwd(),
  "app/api/admin/blog/posts/route.ts",
);

function routeSource(): string {
  return fs.readFileSync(routePath, "utf8");
}

describe("Blog API RBAC contract", () => {
  it("does not use the legacy email allowlist guard", () => {
    const source = routeSource();
    expect(source).not.toContain('requireAdminRequest');
    expect(source).not.toContain('@/lib/api/admin-auth-request');
  });

  it("allows authorised Growth users to read posts", () => {
    const source = routeSource();
    expect(source).toContain('requireAnyAdminPermissionFromRequest');
    expect(source).toContain('"marketing.view", "content.draft", "content.publish"');
  });

  it("requires draft or publish permission for draft writes", () => {
    const source = routeSource();
    expect(source).toContain('status === "draft" ? ["content.draft", "content.publish"] : ["content.publish"]');
  });

  it("requires publish permission for published and scheduled writes", () => {
    const source = routeSource();
    expect(source).toContain(': ["content.publish"]');
  });
});
