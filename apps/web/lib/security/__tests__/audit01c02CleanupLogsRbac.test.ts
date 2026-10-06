import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { priorityPermissionsForRequest } from "@/lib/admin/requireAdmin";

const root = process.cwd();

describe("AUDIT-01C02 cleanup-logs granular RBAC", () => {
  it("classifies destructive cleanup as system.logs.manage", () => {
    expect(
      priorityPermissionsForRequest(
        new Request("https://example.test/api/admin/cleanup-logs", { method: "POST" }),
      ),
    ).toEqual(["system.logs.manage"]);
  });

  it("requires the granular permission at the destructive route", () => {
    const source = readFileSync(
      resolve(root, "app/api/admin/cleanup-logs/route.ts"),
      "utf8",
    );

    expect(source).toContain(
      'requireAdminPermissionFromRequest(request, "system.logs.manage")',
    );
    expect(source).not.toContain("requireAdminUser(");
    expect(source).not.toContain('createClient(url, anon)');
  });

  it("keeps view-only system.logs separate from destructive cleanup authority", () => {
    const permissionSource = readFileSync(
      resolve(root, "lib/admin/requirePermission.ts"),
      "utf8",
    );

    expect(permissionSource).toContain('| "system.logs"');
    expect(permissionSource).toContain('| "system.logs.manage"');
    expect(permissionSource).toContain('"system.logs.manage",');
  });

  it("creates an owner-only default grant for system.logs.manage", () => {
    const sql = readFileSync(
      resolve(
        root,
        "../../supabase/migrations/20261007001500_audit_01c02_cleanup_logs_granular_rbac.sql",
      ),
      "utf8",
    ).toLowerCase();

    expect(sql).toContain("'system.logs.manage'");
    expect(sql).toContain("where r.code = 'owner'");
    expect(sql).not.toContain("general_manager");
    expect(sql).not.toContain("operations_admin");
    expect(sql).not.toContain("finance_admin");
    expect(sql).not.toContain("customer_care");
    expect(sql).not.toContain("workforce_admin");
    expect(sql).not.toContain("marketing_admin");
    expect(sql).not.toContain("supervisor");
  });
});
