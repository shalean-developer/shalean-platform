import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const scopedBookingsPath = path.resolve(
  process.cwd(),
  "app/api/admin/bookings/scoped/route.ts",
);
const scopedBookings = fs.readFileSync(scopedBookingsPath, "utf8");

const customerPolicyMigrationPaths = [
  path.resolve(process.cwd(), "../../supabase/migrations/20260706120000_customer_saved_addresses.sql"),
  path.resolve(process.cwd(), "../../supabase/migrations/20260712143000_customer_booking_rls.sql"),
];
const customerPolicySql = customerPolicyMigrationPaths
  .filter((candidate) => fs.existsSync(candidate))
  .map((candidate) => fs.readFileSync(candidate, "utf8").toLowerCase())
  .join("\n");

describe("P0-03B Supervisor + Customer scope contract", () => {
  it("fails closed when a supervisor has no team assignment", () => {
    expect(scopedBookings).toContain('const isSupervisor = scope.roles.includes("supervisor")');
    expect(scopedBookings).toContain("isSupervisor && scope.teams.length === 0");
    expect(scopedBookings).toContain("Supervisor team assignment is required for booking access.");
    expect(scopedBookings).toContain("(!isSupervisor && globalAssignment)");
  });

  it("keeps customer ownership policies tied to auth.uid()", () => {
    if (!customerPolicySql) return;
    expect(customerPolicySql).toContain("auth.uid()");
    expect(customerPolicySql).toMatch(/customer_id\s*=\s*auth\.uid\(\)|user_id\s*=\s*auth\.uid\(\)/);
  });
});
