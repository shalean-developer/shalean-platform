import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(process.cwd(), "../..");
const migrationPath = resolve(
  root,
  "supabase/migrations/20261005070000_staging_branch_bootstrap_retire_gated_recurring_prepaid.sql",
);

describe("STAGING-BRANCH-BOOTSTRAP-01 recurring prepayment convergence", () => {
  it("retires the two gated recurring prepayment tables idempotently", () => {
    const sql = readFileSync(migrationPath, "utf8")
      .toLowerCase()
      .replace(/--[^\r\n]*/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    expect(sql).toContain(
      "drop table if exists public.recurring_prepaid_allocations;",
    );
    expect(sql).toContain(
      "drop table if exists public.recurring_prepaid_packages;",
    );
    expect(sql).not.toContain("blog_posts_draft_backup_202609");
  });
});
