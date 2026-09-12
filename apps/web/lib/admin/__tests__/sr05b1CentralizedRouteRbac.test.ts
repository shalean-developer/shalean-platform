import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { priorityPermissionsForRequest } from "@/lib/admin/requireAdmin";

const webRoot = resolve(process.cwd());
const read = (path: string) => readFileSync(resolve(webRoot, path), "utf8");
const permissionsFor = (path: string, method = "GET") =>
  priorityPermissionsForRequest(new Request(`https://shalean.test${path}`, { method }));

describe("SR-05B1 centralized Office route RBAC", () => {
  it("preserves Customer Care read and write permission sets", () => {
    expect(permissionsFor("/api/admin/customer-care-cases")).toEqual([
      "customer.view",
      "customer.contact",
      "incident.manage",
    ]);
    expect(permissionsFor("/api/admin/customer-care-cases", "POST")).toEqual([
      "customer.contact",
      "incident.manage",
    ]);
    expect(permissionsFor("/api/admin/customer-care-cases/case-1", "PATCH")).toEqual([
      "customer.contact",
      "incident.manage",
    ]);
  });

  it("preserves Workforce training read and write permission sets", () => {
    expect(permissionsFor("/api/admin/workforce/training-compliance")).toEqual([
      "cleaner.view",
      "cleaner.documents.view",
      "incident.manage",
    ]);
    expect(permissionsFor("/api/admin/workforce/training-compliance", "POST")).toEqual([
      "cleaner.edit",
      "incident.manage",
    ]);
  });

  it("uses only the shared Office API gate in the migrated route files", () => {
    for (const path of [
      "app/api/admin/customer-care-cases/route.ts",
      "app/api/admin/customer-care-cases/[id]/route.ts",
      "app/api/admin/workforce/training-compliance/route.ts",
    ]) {
      const source = read(path);
      expect(source).toContain("requireAdminApi(request)");
      expect(source).not.toContain("admin_has_permission");
    }
  });
});
