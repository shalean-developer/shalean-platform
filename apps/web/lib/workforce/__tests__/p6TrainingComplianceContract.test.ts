import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { priorityPermissionsForRequest } from "@/lib/admin/requireAdmin";

const repoRoot = path.resolve(process.cwd(), "../..");
const read = (p: string) => fs.readFileSync(path.join(repoRoot, p), "utf8");
const migration = read("supabase/migrations/20260809113000_p6_training_compliance_foundation.sql");
const route = read("apps/web/app/api/admin/workforce/training-compliance/route.ts");
const service = read("apps/web/lib/workforce/trainingCompliance.ts");

describe("P6 workforce training/compliance", () => {
  it("creates server-managed training and compliance ledgers with RLS", () => {
    expect(migration).toContain("workforce_training_modules");
    expect(migration).toContain("cleaner_training_assignments");
    expect(migration).toContain("cleaner_compliance_records");
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("revoke all on table public.cleaner_training_assignments from anon, authenticated");
  });

  it("tracks required induction, customer care, safety and service modules", () => {
    expect(migration).toContain("'induction'");
    expect(migration).toContain("'customer-care'");
    expect(migration).toContain("'health-safety'");
    expect(migration).toContain("'deep-cleaning'");
    expect(migration).toContain("'move-cleaning'");
  });

  it("fails readiness closed for missing required training and expired compliance", () => {
    expect(service).toContain("requiredModuleIds");
    expect(service).toContain("if (!assignment)");
    expect(service).toContain("expires_at");
    expect(service).toContain("status !== \"valid\"");
  });

  it("derives assignment expiry from module validity on completion", () => {
    expect(service).toContain('select("validity_days")');
    expect(service).toContain("validityDays * 86_400_000");
  });

  it("keeps reads and writes behind centralized Workforce permissions", () => {
    expect(
      priorityPermissionsForRequest(
        new Request("https://shalean.test/api/admin/workforce/training-compliance"),
      ),
    ).toEqual(["cleaner.view", "cleaner.documents.view", "incident.manage"]);
    expect(
      priorityPermissionsForRequest(
        new Request("https://shalean.test/api/admin/workforce/training-compliance", { method: "POST" }),
      ),
    ).toEqual(["cleaner.edit", "incident.manage"]);
    expect(route).toContain("requireAdminApi(request)");
    expect(route).not.toContain("admin_has_permission");
  });
});
