import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(process.cwd(), "../..");
const migrationPath = resolve(
  root,
  "supabase/migrations/20261005070000_staging_branch_bootstrap_recurring_prepayment.sql",
);

describe("STAGING-BRANCH-BOOTSTRAP-01 recurring prepayment convergence", () => {
  it("keeps the recurring prepayment ledger required by runtime checkout", () => {
    const sql = readFileSync(migrationPath, "utf8")
      .toLowerCase()
      .replace(/--[^\r\n]*/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    expect(sql).toContain(
      "create table if not exists public.recurring_prepaid_packages",
    );
    expect(sql).toContain(
      "create table if not exists public.recurring_prepaid_allocations",
    );
    expect(sql).toContain(
      "grant all on table public.recurring_prepaid_packages to service_role",
    );
    expect(sql).toContain(
      "grant all on table public.recurring_prepaid_allocations to service_role",
    );
    expect(sql).not.toContain(
      "drop table if exists public.recurring_prepaid_packages",
    );
    expect(sql).not.toContain(
      "drop table if exists public.recurring_prepaid_allocations",
    );
  });
});
