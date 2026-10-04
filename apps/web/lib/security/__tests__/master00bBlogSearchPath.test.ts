import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(process.cwd(), "../..");
const migrationsDir = resolve(root, "supabase/migrations");
const migrationFiles = readdirSync(migrationsDir)
  .filter((name) => name.endsWith(".sql"))
  .sort();

const stripSqlComments = (sql: string) =>
  sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\r\n]*/g, " ");

const qualifiedFunctionName =
  String.raw`(?:"?public"?\s*\.\s*)?"?blog_is_admin"?`;
const createFunctionName =
  String.raw`${qualifiedFunctionName}\s*\(\s*\)`;
const alterFunctionName =
  String.raw`${qualifiedFunctionName}(?:\s*\(\s*\))?`;
const securityOperation = new RegExp(
  String.raw`(?:create\s+or\s+replace\s+function\s+${createFunctionName}|alter\s+function\s+${alterFunctionName}\s+(?:set\s+search_path\s*(?:(?:=|to)\s*[^;]+|from\s+current)|reset\s+(?:search_path|all)))`,
  "g",
);

const operations = migrationFiles.flatMap((name) => {
  const sql = stripSqlComments(
    readFileSync(resolve(migrationsDir, name), "utf8").toLowerCase(),
  );
  const matches = [...sql.matchAll(securityOperation)];
  return matches.map((match) => ({ name, operation: match[0].trim() }));
});

const isExclusivePgCatalog = (operation: string | undefined) => {
  if (!operation) return false;
  const normalized = operation.replace(/\s+/g, " ").trim();
  return /^alter function (?:"?public"?\s*\.\s*)?"?blog_is_admin"?(?:\s*\(\s*\))? set search_path\s*(?:=|to)\s*"?pg_catalog"?\s*$/i.test(
    normalized,
  );
};

describe("MASTER-00B-02 blog helper search_path", () => {
  it("keeps the effective ordered migration chain pinned exclusively to pg_catalog", () => {
    expect(operations.length).toBeGreaterThan(0);
    expect(isExclusivePgCatalog(operations.at(-1)?.operation)).toBe(true);
  });

  it("recognizes PostgreSQL SET/RESET variants, quoted identifiers, and omitted arg lists", () => {
    const examples = [
      "alter function public.blog_is_admin() set search_path = public",
      "alter function public.blog_is_admin() set search_path to public",
      'alter function "public"."blog_is_admin"() set search_path to public',
      "alter function public.blog_is_admin set search_path from current",
      "alter function public.blog_is_admin reset search_path",
      "alter function public.blog_is_admin reset all",
    ];

    for (const sql of examples) {
      expect([...stripSqlComments(sql).matchAll(securityOperation)]).toHaveLength(1);
    }
  });

  it("rejects broader or similarly prefixed search paths", () => {
    expect(
      isExclusivePgCatalog(
        "alter function public.blog_is_admin() set search_path = pg_catalog, public",
      ),
    ).toBe(false);
    expect(
      isExclusivePgCatalog(
        "alter function public.blog_is_admin set search_path = pg_catalog_evil",
      ),
    ).toBe(false);
  });

  it("ignores commented-out operations when determining effective state", () => {
    const sql = `
      alter function public.blog_is_admin reset all;
      -- alter function public.blog_is_admin() set search_path = pg_catalog;
    `;
    const matches = [
      ...stripSqlComments(sql.toLowerCase()).matchAll(securityOperation),
    ];
    expect(matches).toHaveLength(1);
    expect(matches[0]?.[0]).toContain("reset all");
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
