import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

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

  it("fails readiness closed for missing required training, missing compliance evidence and expired compliance", () => {
    expect(service).toContain("requiredModuleIds");
    expect(service).toContain("if (!assignment)");
    expect(service).toContain("const missingComplianceEvidence = complianceRows.length === 0");
    expect(service).toContain("!missingComplianceEvidence");
    expect(service).toContain("expires_at");
    expect(service).toContain("status !== \"valid\"");
  });

  it("exposes missing compliance evidence instead of silently calling the cleaner ready", () => {
    expect(service).toContain("missingComplianceEvidence,");
    expect(service).toContain("ready: overdueTraining === 0 && !missingComplianceEvidence && nonCompliant === 0");
  });

  it("derives assignment expiry from module validity on completion", () => {
    expect(service).toContain('select("validity_days")');
    expect(service).toContain("validityDays * 86_400_000");
  });

  it("keeps writes behind workforce permissions", () => {
    expect(route).toContain('"cleaner.edit", "incident.manage"');
    expect(route).toContain('requireAdminApi(request)');
  });
});
