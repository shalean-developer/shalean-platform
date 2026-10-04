import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(process.cwd(), "../..");
const migrationsDir = resolve(root, "supabase/migrations");
const hardeningFile =
  "20261004231500_master_00b_04_assign_booking_reference_search_path.sql";

const migrationFiles = readdirSync(migrationsDir)
  .filter((name) => name.endsWith(".sql"))
  .sort();

describe("MASTER-00B-04 booking reference trigger search_path", () => {
  it("pins assign_booking_reference exclusively to pg_catalog", () => {
    const migration = readFileSync(
      resolve(migrationsDir, hardeningFile),
      "utf8",
    )
      .toLowerCase()
      .replace(/--[^\r\n]*/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    expect(migration).toBe(
      "alter function public.assign_booking_reference() set search_path = pg_catalog;",
    );
  });

  it("fails closed on any later migration that mentions assign_booking_reference", () => {
    const baselineIndex = migrationFiles.indexOf(hardeningFile);
    expect(baselineIndex).toBeGreaterThanOrEqual(0);

    const laterMentions = migrationFiles
      .slice(baselineIndex + 1)
      .filter((name) =>
        readFileSync(resolve(migrationsDir, name), "utf8")
          .toLowerCase()
          .includes("assign_booking_reference"),
      );

    expect(laterMentions).toEqual([]);
  });
});
