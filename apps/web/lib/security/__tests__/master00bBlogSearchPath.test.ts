import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(process.cwd(), "../..");
const migrationsDir = resolve(root, "supabase/migrations");
const migrationFiles = readdirSync(migrationsDir)
  .filter((name) => name.endsWith(".sql"))
  .sort();

const maskNonExecutableSql = (sql: string) => {
  let out = "";
  let i = 0;

  while (i < sql.length) {
    if (sql.startsWith("--", i)) {
      const end = sql.indexOf("\n", i + 2);
      if (end === -1) break;
      out += " ".repeat(end - i) + "\n";
      i = end + 1;
      continue;
    }

    if (sql.startsWith("/*", i)) {
      const end = sql.indexOf("*/", i + 2);
      if (end === -1) {
        out += " ".repeat(sql.length - i);
        break;
      }
      out += " ".repeat(end + 2 - i);
      i = end + 2;
      continue;
    }

    if (sql[i] === "'") {
      const start = i++;
      while (i < sql.length) {
        if (sql[i] === "'" && sql[i + 1] === "'") {
          i += 2;
          continue;
        }
        if (sql[i] === "'") {
          i += 1;
          break;
        }
        i += 1;
      }
      out += " ".repeat(i - start);
      continue;
    }

    if (sql[i] === "$") {
      const tag = sql.slice(i).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/)?.[0];
      if (tag) {
        const start = i;
        const end = sql.indexOf(tag, i + tag.length);
        if (end === -1) {
          out += " ".repeat(sql.length - start);
          break;
        }
        i = end + tag.length;
        out += " ".repeat(i - start);
        continue;
      }
    }

    out += sql[i];
    i += 1;
  }

  return out;
};

const qualifiedFunctionName =
  String.raw`(?:"?public"?\s*\.\s*)?"?blog_is_admin"?`;
const createFunctionName =
  String.raw`${qualifiedFunctionName}\s*\(\s*\)`;
const alterFunctionName =
  String.raw`${qualifiedFunctionName}(?:\s*\(\s*\))?`;
const searchPathParam = String.raw`"?search_path"?`;

const securityOperation = new RegExp(
  String.raw`(?:create\s+or\s+replace\s+function\s+${createFunctionName}|alter\s+(?:function|routine)\s+${alterFunctionName}\s+(?:set\s+${searchPathParam}\s*(?:(?:=|to)\s*[^;]+|from\s+current)|reset\s+(?:${searchPathParam}|all)))`,
  "g",
);

const operations = migrationFiles.flatMap((name) => {
  const sql = maskNonExecutableSql(
    readFileSync(resolve(migrationsDir, name), "utf8").toLowerCase(),
  );
  const matches = [...sql.matchAll(securityOperation)];
  return matches.map((match) => ({ name, operation: match[0].trim() }));
});

const isExclusivePgCatalog = (operation: string | undefined) => {
  if (!operation) return false;
  const normalized = operation.replace(/\s+/g, " ").trim();
  return /^alter (?:function|routine) (?:"?public"?\s*\.\s*)?"?blog_is_admin"?(?:\s*\(\s*\))? set "?search_path"?\s*(?:=|to)\s*"?pg_catalog"?\s*$/i.test(
    normalized,
  );
};

describe("MASTER-00B-02 blog helper search_path", () => {
  it("keeps the effective ordered migration chain pinned exclusively to pg_catalog", () => {
    expect(operations.length).toBeGreaterThan(0);
    expect(isExclusivePgCatalog(operations.at(-1)?.operation)).toBe(true);
  });

  it("recognizes supported ALTER FUNCTION/ROUTINE SET and RESET variants", () => {
    const examples = [
      "alter function public.blog_is_admin() set search_path = public",
      "alter function public.blog_is_admin set search_path to public",
      'alter function "public"."blog_is_admin"() reset "search_path"',
      "alter function public.blog_is_admin set search_path from current",
      "alter function public.blog_is_admin reset all",
      "alter routine public.blog_is_admin() reset all",
      'alter routine "public"."blog_is_admin" set "search_path" to public',
    ];

    for (const sql of examples) {
      expect([...maskNonExecutableSql(sql).matchAll(securityOperation)]).toHaveLength(1);
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
        "alter routine public.blog_is_admin set search_path = pg_catalog_evil",
      ),
    ).toBe(false);
  });

  it("ignores comments, strings, and dollar-quoted bodies when ordering operations", () => {
    const sql = `
      alter function public.blog_is_admin reset all;
      -- alter function public.blog_is_admin() set search_path = pg_catalog;
      select 'alter function public.blog_is_admin() set search_path = pg_catalog';
      do $$ begin
        perform 'alter function public.blog_is_admin() set search_path = pg_catalog';
      end $$;
    `;
    const matches = [
      ...maskNonExecutableSql(sql.toLowerCase()).matchAll(securityOperation),
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
