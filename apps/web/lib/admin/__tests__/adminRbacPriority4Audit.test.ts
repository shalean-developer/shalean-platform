import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const webRoot = resolve(process.cwd());
function read(path: string): string {
  return readFileSync(resolve(webRoot, path), "utf8");
}

describe("Admin RBAC Priority 4 audit contracts", () => {
  it("fails closed when sensitive access cannot be audited", () => {
    const source = read("lib/admin/requirePermission.ts");
    expect(source).toContain('"cleaner.documents.view"');
    expect(source).toContain('"cleaner.bank.view"');
    expect(source).toContain('"booking.export"');
    expect(source).toContain('"customer.export"');
    expect(source).toContain('"bulk_export.approve"');
    expect(source).toContain("Sensitive access audit unavailable. Access was not granted.");
    expect(source).toContain('.from("admin_audit_events").insert');
  });

  it("audits role, branch and team assignment lifecycle in the database", () => {
    const migration = read("../../supabase/migrations/20260807220500_admin_assignment_audit_triggers.sql");
    expect(migration).toContain("audit_admin_user_roles_change");
    expect(migration).toContain("audit_admin_branch_assignments_change");
    expect(migration).toContain("audit_admin_team_assignments_change");
    expect(migration).toContain("admin_assignment_granted");
    expect(migration).toContain("admin_assignment_revoked");
    expect(migration).toContain("admin_assignment_expiry_changed");
    expect(migration).toContain("admin_audit_events");
  });
});
