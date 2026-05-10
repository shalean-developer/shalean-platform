import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sqlPath = path.join(__dirname, "../../../../../supabase/queries/audit_payout_subsystem_convergence_phase11.sql");

describe("audit_payout_subsystem_convergence_phase11.sql Phase 15A section", () => {
  it("is SELECT-only after stripping end-of-line comments (no DML/DDL verbs)", () => {
    const full = readFileSync(sqlPath, "utf8");
    const marker = "-- Phase 15A Week 1";
    const i = full.indexOf(marker);
    expect(i).toBeGreaterThan(-1);
    const slice = full.slice(i);
    const stripped = slice.replace(/--[^\n]*/g, " ");
    const lower = stripped.toLowerCase();

    expect(lower).toContain("select");
    expect(lower).not.toMatch(/\bupdate\s+/);
    expect(lower).not.toMatch(/\binsert\s+/);
    expect(lower).not.toMatch(/\bdelete\s+/);
    expect(lower).not.toMatch(/\bmerge\s+/);
    expect(lower).not.toMatch(/\balter\s+/);
    expect(lower).not.toMatch(/\bdrop\s+/);
  });
});
