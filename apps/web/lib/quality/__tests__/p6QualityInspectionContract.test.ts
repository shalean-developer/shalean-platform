import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(process.cwd(), "../..");
const read = (relativePath: string) => fs.readFileSync(path.join(repoRoot, relativePath), "utf8");

const migration = read("supabase/migrations/20260809103000_p6_quality_inspection_foundation.sql");
const service = read("apps/web/lib/quality/qualityInspections.ts");
const detailRoute = read("apps/web/app/api/admin/quality/inspections/[id]/route.ts");
const listRoute = read("apps/web/app/api/admin/quality/inspections/route.ts");
const adminPolicy = read("apps/web/lib/admin/requireAdmin.ts");

describe("P6 Quality Assurance & Inspection contract", () => {
  it("keeps QA ledgers server-managed with RLS enabled", () => {
    expect(migration).toContain("alter table public.quality_inspections enable row level security");
    expect(migration).toContain("alter table public.quality_inspection_defects enable row level security");
    expect(migration).toContain("alter table public.quality_inspection_events enable row level security");
    expect(migration).toContain("revoke all on table public.quality_inspections from anon, authenticated");
  });

  it("uses centralized incident.manage for all QA writes", () => {
    expect(listRoute).toContain("requireAdminApi(request)");
    expect(detailRoute).toContain("requireAdminApi(request)");
    expect(listRoute).not.toContain("admin_has_permission");
    expect(detailRoute).not.toContain("admin_has_permission");
    expect(adminPolicy).toContain('if (path.includes("/quality/inspections"))');
    expect(adminPolicy).toContain('return read ? ["incident.manage", "booking.view", "cleaner.view"] : ["incident.manage"]');
  });

  it("derives score from checklist, before/after evidence and open defect penalties", () => {
    expect(service).toContain("checklistScore * 0.6 + photoScore * 0.4 - defectPenalty");
    expect(service).toContain('type === "before"');
    expect(service).toContain('type === "after"');
    expect(service).toContain("unresolvedCritical");
    expect(service).toContain('recommendedStatus = "failed"');
    expect(service).toContain('recommendedStatus = "rework_required"');
  });

  it("supports defect/rework resolution and score refresh", () => {
    expect(detailRoute).toContain('action === "add_defect"');
    expect(detailRoute).toContain('action === "resolve_defect"');
    expect(detailRoute).toContain('action === "sign_off"');
    expect(detailRoute).toContain('action === "refresh_score"');
  });
});
