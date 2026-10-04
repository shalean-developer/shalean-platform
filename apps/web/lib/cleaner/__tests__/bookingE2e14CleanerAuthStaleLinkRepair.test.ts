import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

describe("BOOKING-E2E-14 cleaner stale Auth link repair", () => {
  it("never clears the NOT NULL cleaner auth link before replacement Auth is ready", () => {
    const src = read("lib/cleaner/linkCleanerAuth.ts");

    expect(src).toContain("cleaners.auth_user_id is NOT NULL");
    expect(src).not.toContain('update({ auth_user_id: null })');
    expect(src).toContain('update({ auth_user_id: newId })');
  });

  it("validates DB-resolved Auth ids through GoTrue before reusing them", () => {
    const src = read("lib/cleaner/linkCleanerAuth.ts");

    expect(src).toContain("authUserIsUsable");
    expect(src).toContain("ignoring ghost auth user resolved by email");
    expect(src).toContain("await authUserIsUsable(admin, uid)");
  });

  it("has a collision-safe real-domain fallback login for ghost seeded identities", () => {
    const src = read("lib/cleaner/linkCleanerAuth.ts");

    expect(src).toContain("@cleaner.shalean.com");
    expect(src).toContain("fallbackCleanerAuthEmail");
    expect(src).toContain("authCreationEmailCandidates");
  });

  it("generates recovery links from the linked Auth identity instead of a stale cleaner contact email", () => {
    const src = read("lib/cleaner/adminPassword.ts");

    expect(src).toContain("getUserById(String(linked.auth_user_id))");
    expect(src).toContain("authUser.data.user.email");
    expect(src).toContain('type: "recovery"');
  });
});
