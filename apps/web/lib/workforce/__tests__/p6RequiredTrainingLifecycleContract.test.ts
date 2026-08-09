import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(process.cwd(), "../..");
const migration = fs.readFileSync(
  path.join(repoRoot, "supabase/migrations/20260809203000_p6_required_training_assignment_lifecycle.sql"),
  "utf8",
);

describe("P6 required training lifecycle", () => {
  it("backfills required assignments for existing active cleaners", () => {
    expect(migration).toContain("cross join public.workforce_training_modules");
    expect(migration).toContain("c.is_active = true");
    expect(migration).toContain("m.is_required = true");
    expect(migration).toContain("on conflict (cleaner_id, module_id) do nothing");
  });

  it("automatically assigns required modules to new or reactivated cleaners", () => {
    expect(migration).toContain("p6_assign_required_training_for_cleaner");
    expect(migration).toContain("after insert or update of is_active on public.cleaners");
  });

  it("converges newly-required modules across active cleaners", () => {
    expect(migration).toContain("p6_assign_required_training_for_module");
    expect(migration).toContain("after insert or update of is_active, is_required on public.workforce_training_modules");
  });

  it("gives required assignments an actionable due window", () => {
    expect(migration).toContain("now() + interval '30 days'");
  });
});
