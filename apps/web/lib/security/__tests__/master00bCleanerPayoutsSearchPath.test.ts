import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(process.cwd(), "../..");
const migrationsDir = resolve(root, "supabase/migrations");
const hardeningFile =
  "20261005014500_master_00b_07_cleaner_payouts_search_path.sql";

const migrationFiles = readdirSync(migrationsDir)
  .filter((name) => name.endsWith(".sql"))
  .sort();

describe("MASTER-00B-07 cleaner payouts trigger search_path", () => {
  it("pins cleaner_payouts_block_mutate_when_frozen exclusively to pg_catalog", () => {
    const migration = readFileSync(
      resolve(migrationsDir, hardeningFile),
      "utf8",
    )
      .toLowerCase()
      .replace(/--[^\r\n]*/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    expect(migration).toBe(
      "alter function public.cleaner_payouts_block_mutate_when_frozen() set search_path = pg_catalog;",
    );
  });

  it("fails closed on any later migration that mentions the cleaner payouts trigger function", () => {
    const baselineIndex = migrationFiles.indexOf(hardeningFile);
    expect(baselineIndex).toBeGreaterThanOrEqual(0);

    const laterMentions = migrationFiles
      .slice(baselineIndex + 1)
      .filter((name) =>
        readFileSync(resolve(migrationsDir, name), "utf8")
          .toLowerCase()
          .includes("cleaner_payouts_block_mutate_when_frozen"),
      );

    expect(laterMentions).toEqual([]);
  });
});
