import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(process.cwd(), "../..");
const migrationsDir = resolve(root, "supabase/migrations");
const migrationFiles = readdirSync(migrationsDir)
  .filter((name) => name.endsWith(".sql"))
  .sort();

const functionName =
  String.raw`(?:"?public"?\s*\.\s*)?"?blog_is_admin"?\s*\(\s*\)`;
const securityOperation = new RegExp(
  String.raw`(?:create\s+or\s+replace\s+function\s+${functionName}|alter\s+function\s+${functionName}\s+(?:set\s+search_path\s*(?:=|to)\s*[^;]+|reset\s+(?:search_path|all)))`,
  "g",
);

const operations = migrationFiles.flatMap((name) => {
  const sql = readFileSync(resolve(migrationsDir, name), "utf8").toLowerCase();
  const matches = [...sql.matchAll(securityOperation)];
  return matches.map((match) => ({ name, operation: match[0] }));
});

describe("MASTER-00B-02 blog helper search_path", () => {
  it("keeps the effective ordered migration chain pinned to pg_catalog", () => {
    expect(operations.length).toBeGreaterThan(0);
    const latest = operations.at(-1);
    expect(latest?.operation).toContain("alter function public.blog_is_admin()");
    expect(latest?.operation).toMatch(
      /set\s+search_path\s*(?:=|to)\s*pg_catalog/,
    );
  });

  it("recognizes PostgreSQL SET and RESET forms plus quoted identifiers", () => {
    const examples = [
      "alter function public.blog_is_admin() set search_path = public",
      "alter function public.blog_is_admin() set search_path to public",
      'alter function "public"."blog_is_admin"() set search_path to public',
      "alter function public.blog_is_admin() reset search_path",
      "alter function public.blog_is_admin() reset all",
    ];

    for (const sql of examples) {
      expect([...sql.matchAll(securityOperation)]).toHaveLength(1);
    }
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
