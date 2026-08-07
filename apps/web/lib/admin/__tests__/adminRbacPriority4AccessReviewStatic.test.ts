import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const webRoot = resolve(process.cwd());
function read(path: string): string {
  return readFileSync(resolve(webRoot, path), "utf8");
}

describe("Admin RBAC Priority 4 access-review contracts", () => {
  it("requires role.manage to record an access review", () => {
    const source = read("app/api/admin/security/access-review/route.ts");
    expect(source).toContain('requireAdminPermissionFromRequest(request, "role.manage")');
    expect(source).toContain('event_type: "admin_access_review_recorded"');
    expect(source).toContain("Audit logging failed; review was not recorded.");
  });

  it("stores immutable review history with a monthly next-review date", () => {
    const migration = read("../../supabase/migrations/20260807222000_admin_access_reviews.sql");
    expect(migration).toContain("create table if not exists public.admin_access_reviews");
    expect(migration).toContain("next_review_at timestamptz not null default (now() + interval '30 days')");
    expect(migration).toContain("enable row level security");
  });
});
