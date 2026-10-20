import { createHash } from "node:crypto";
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

  it("allows only the exact reviewed RBAC replacement and private-schema move", () => {
    const baselineIndex = migrationFiles.indexOf(hardeningFile);
    expect(baselineIndex).toBeGreaterThanOrEqual(0);

    const laterMentions = migrationFiles
      .slice(baselineIndex + 1)
      .filter((name) =>
        readFileSync(resolve(migrationsDir, name), "utf8")
          .toLowerCase()
          .includes("blog_is_admin"),
      );

    const reviewed = {
      "20261020155014_blog_cms_permission_boundary.sql": "82ecf85706ecac0bd415ef3713cbf792bcdb3bd982c64cd47f723086ee7c7cb3",
      "20261020162025_blog_editor_security_advisor_followup.sql": "b1ed59cc01dff88eade5722401f9556de779d9b827523ea868018671a4413da2",
    };
    expect(laterMentions).toEqual(Object.keys(reviewed));
    for (const [file, expectedHash] of Object.entries(reviewed)) {
      const source = readFileSync(resolve(migrationsDir, file), "utf8");
      expect(createHash("sha256").update(source).digest("hex")).toBe(expectedHash);
    }
    const rbac = readFileSync(resolve(migrationsDir, Object.keys(reviewed)[0]), "utf8");
    expect(rbac).toMatch(/security definer set search_path = pg_catalog/i);
    expect(rbac).toContain("public.admin_has_permission(auth.uid()");
    expect(rbac).not.toMatch(/auth\.jwt\(|->\s*'user_metadata'/i);
    const privateSchema = readFileSync(resolve(migrationsDir, Object.keys(reviewed)[1]), "utf8");
    expect(privateSchema).toContain("alter function public.blog_is_admin() set schema blog_security");
    expect(privateSchema).toContain("revoke all on schema blog_security from public, anon");
  });
});
