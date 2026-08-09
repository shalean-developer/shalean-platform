import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(process.cwd(), "../..");
const migrationPath = path.join(
  repoRoot,
  "supabase/migrations/20260809094500_exclude_recurring_from_pending_payment_purge.sql",
);

describe("P5 recurring pending-payment purge safety", () => {
  it("never deletes system-generated recurring occurrences as abandoned checkout rows", () => {
    const sql = fs.readFileSync(migrationPath, "utf8");
    expect(sql).toContain("coalesce(is_recurring_generated, false) = false");
    expect(sql).toContain("coalesce(is_recurring_generated, false) = true");
    expect(sql).toContain("recurring_protected");
  });
});
