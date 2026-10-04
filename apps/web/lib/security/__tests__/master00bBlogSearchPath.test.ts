import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(process.cwd(), "../..");
const migration = readFileSync(
  resolve(root, "supabase/migrations/20261004175619_master_00b_02_blog_search_path.sql"),
  "utf8",
).toLowerCase();

describe("MASTER-00B-02 blog helper search_path", () => {
  it("pins blog_is_admin to pg_catalog without replacing the function body", () => {
    expect(migration).toContain("alter function public.blog_is_admin()");
    expect(migration).toContain("set search_path = pg_catalog");
    expect(migration).not.toContain("create or replace function");
  });
});
