import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(process.cwd(), "../..");
const migrationsDir = resolve(root, "supabase/migrations");
const hardeningFile =
  "20261004221410_master_00b_03_admin_audit_trigger_search_path.sql";

const migrationFiles = readdirSync(migrationsDir)
  .filter((name) => name.endsWith(".sql"))
  .sort();

describe("MASTER-00B-03 admin audit trigger search_path", () => {
  it("pins prevent_admin_audit_mutation exclusively to pg_catalog", () => {
    const migration = readFileSync(
      resolve(migrationsDir, hardeningFile),
      "utf8",
    )
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();

    expect(migration).toBe(
      "alter function public.prevent_admin_audit_mutation() set search_path = pg_catalog;",
    );
  });

  it("fails closed on any later migration that mentions the trigger function", () => {
    const baselineIndex = migrationFiles.indexOf(hardeningFile);
    expect(baselineIndex).toBeGreaterThanOrEqual(0);

    const laterMentions = migrationFiles
      .slice(baselineIndex + 1)
      .filter((name) =>
        readFileSync(resolve(migrationsDir, name), "utf8")
          .toLowerCase()
          .includes("prevent_admin_audit_mutation"),
      );

    expect(laterMentions).toEqual([]);
  });
});
