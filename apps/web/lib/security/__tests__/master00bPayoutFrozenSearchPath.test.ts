import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(process.cwd(), "../..");
const migrationsDir = resolve(root, "supabase/migrations");
const hardeningFile =
  "20261005002000_master_00b_06_payout_frozen_search_path.sql";

const migrationFiles = readdirSync(migrationsDir)
  .filter((name) => name.endsWith(".sql"))
  .sort();

describe("MASTER-00B-06 frozen payout trigger search_path", () => {
  it("pins bookings_trg_payout_frozen_immutable_after_eligible exclusively to pg_catalog", () => {
    const migration = readFileSync(
      resolve(migrationsDir, hardeningFile),
      "utf8",
    )
      .toLowerCase()
      .replace(/--[^\r\n]*/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    expect(migration).toBe(
      "alter function public.bookings_trg_payout_frozen_immutable_after_eligible() set search_path = pg_catalog;",
    );
  });

  it("fails closed on any later migration that mentions the frozen payout trigger function", () => {
    const baselineIndex = migrationFiles.indexOf(hardeningFile);
    expect(baselineIndex).toBeGreaterThanOrEqual(0);

    const laterMentions = migrationFiles
      .slice(baselineIndex + 1)
      .filter((name) =>
        readFileSync(resolve(migrationsDir, name), "utf8")
          .toLowerCase()
          .includes("bookings_trg_payout_frozen_immutable_after_eligible"),
      );

    expect(laterMentions).toEqual([]);
  });
});
