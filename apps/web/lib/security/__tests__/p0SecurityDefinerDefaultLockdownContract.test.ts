import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "../../supabase/migrations/20260812090000_p0_02b_security_definer_default_lockdown.sql",
);
const sql = readFileSync(migrationPath, "utf8").toLowerCase();

describe("P0-02B SECURITY DEFINER default lockdown", () => {
  it("enumerates every public SECURITY DEFINER function", () => {
    expect(sql).toContain("n.nspname = 'public'");
    expect(sql).toContain("p.prosecdef is true");
  });

  it("revokes PUBLIC, anon and authenticated before re-granting", () => {
    expect(sql).toContain("revoke all on function %s from public");
    expect(sql).toContain("revoke all on function %s from anon");
    expect(sql).toContain("revoke all on function %s from authenticated");
  });

  it("keeps only the approved public and authenticated helper allowlists", () => {
    for (const name of [
      "public_review_banner_stats",
      "public_marketing_reviews_for_area",
      "user_owns_booking",
      "user_has_booking_with_cleaner",
    ]) {
      expect(sql).toContain(`'${name}'`);
    }
  });

  it("grants service_role for every classified function", () => {
    expect(sql).toContain("grant execute on function %s to service_role");
  });
});
