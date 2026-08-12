import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = path.resolve(
  process.cwd(),
  "../../supabase/migrations/20260812101500_p0_03b_cleaner_column_rbac.sql",
);

const sql = fs.readFileSync(migrationPath, "utf8").toLowerCase();

describe("P0-03B cleaner column RBAC contract", () => {
  it("removes table-wide authenticated UPDATE on cleaners", () => {
    expect(sql).toContain("revoke update on table public.cleaners from authenticated");
  });

  it("allows only explicit self-service profile and availability columns", () => {
    const grantMatch = sql.match(/grant update\s*\(([\s\S]*?\))\s*on table public\.cleaners to authenticated/);
    expect(grantMatch).not.toBeNull();

    const grant = grantMatch?.[1] ?? "";
    for (const allowed of [
      "full_name",
      "email",
      "phone",
      "phone_number",
      "home_lat",
      "home_lng",
      "latitude",
      "longitude",
      "location",
      "is_available",
      "availability_start",
      "availability_end",
    ]) {
      expect(grant).toContain(allowed);
    }

    for (const adminOwned of [
      "auth_user_id",
      "status",
      "rating",
      "jobs_completed",
      "is_active",
      "acceptance_rate_recent",
      "tier",
      "priority_score",
      "marketplace_outcome_ema",
      "marketplace_outcome_samples",
      "review_count",
      "needs_quality_review",
      "bonus_payout_zar",
      "can_do_deep_cleaning",
      "can_do_move_cleaning",
      "total_offers",
      "accepted_offers",
      "acceptance_rate",
      "availability_weekdays",
      "last_active_at",
    ]) {
      expect(grant).not.toContain(adminOwned);
    }
  });
});
