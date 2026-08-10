import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(`${root}/${path}`, "utf8");

describe("supervisor to cleaner account linking", () => {
  it("resolves canonical cleaner auth first and an active alias second", () => {
    const source = read("lib/cleaner/resolveCleanerFromRequest.ts");
    expect(source.indexOf('.from("cleaners")')).toBeLessThan(source.indexOf('.from("cleaner_auth_links")'));
    expect(source).toContain('.eq("auth_user_id", authUserId)');
    expect(source).toContain('.eq("is_active", true)');
  });

  it("keeps aliases service-only and seeds all current supervisors", () => {
    const migration = read("../../supabase/migrations/20260810170000_supervisor_cleaner_auth_links.sql");
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("revoke all on table public.cleaner_auth_links from anon, authenticated");
    for (const email of ["lucia@shalean.com", "marvelous@shalean.com", "normatter@shalean.com", "thandeka@shalean.com"]) {
      expect(migration).toContain(email);
    }
  });

  it("requires an active Supervisor role and records an immutable audit event", () => {
    const route = read("app/api/admin/cleaners/[id]/auth-links/route.ts");
    expect(route).toContain('.eq("code", "supervisor")');
    expect(route).toContain('event_type: "cleaner_auth_linked"');
    expect(route).toContain('["cleaner.edit", "role.manage"]');
  });
});
