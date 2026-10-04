import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(process.cwd(), "../..");
const migrationsDir = resolve(root, "supabase/migrations");
const hardeningFile =
  "20261004175619_master_00b_02_blog_search_path.sql";

const migrationFiles = readdirSync(migrationsDir)
  .filter((name) => name.endsWith(".sql"))
  .sort();

describe("MASTER-00B-02 blog helper search_path", () => {
  it("pins blog_is_admin exclusively to pg_catalog", () => {
    const migration = readFileSync(
      resolve(migrationsDir, hardeningFile),
      "utf8",
    )
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();

    expect(migration).toBe(
      "alter function public.blog_is_admin() set search_path = pg_catalog;",
    );
  });

  it("fails closed on any later migration that mentions blog_is_admin", () => {
    const baselineIndex = migrationFiles.indexOf(hardeningFile);
    expect(baselineIndex).toBeGreaterThanOrEqual(0);

    const laterMentions = migrationFiles
      .slice(baselineIndex + 1)
      .filter((name) =>
        readFileSync(resolve(migrationsDir, name), "utf8")
          .toLowerCase()
          .includes("blog_is_admin"),
      );

    expect(laterMentions).toEqual([]);
  });
});
