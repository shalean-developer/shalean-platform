import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(process.cwd(), "../..");
const migrationsDir = resolve(root, "supabase/migrations");
const migrationFiles = readdirSync(migrationsDir)
  .filter((name) => name.endsWith(".sql"))
  .sort();

const operations = migrationFiles.flatMap((name) => {
  const sql = readFileSync(resolve(migrationsDir, name), "utf8").toLowerCase();
  const matches = [
    ...sql.matchAll(
      /(create\s+or\s+replace\s+function\s+public\.blog_is_admin\s*\(\s*\)|alter\s+function\s+public\.blog_is_admin\s*\(\s*\)\s+(?:set\s+search_path\s*=\s*[^;]+|reset\s+search_path))/g,
    ),
  ];
  return matches.map((match) => ({ name, operation: match[0] }));
});

describe("MASTER-00B-02 blog helper search_path", () => {
  it("keeps the effective ordered migration chain pinned to pg_catalog", () => {
    expect(operations.length).toBeGreaterThan(0);
    const latest = operations.at(-1);
    expect(latest?.operation).toContain("alter function public.blog_is_admin()");
    expect(latest?.operation).toContain("set search_path = pg_catalog");
  });

  it("keeps the hardening migration body-only-safe", () => {
    const migration = readFileSync(
      resolve(
        migrationsDir,
        "20261004175619_master_00b_02_blog_search_path.sql",
      ),
      "utf8",
    ).toLowerCase();

    expect(migration).not.toContain("create or replace function");
  });
});
