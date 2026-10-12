import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

describe("AUDIT-03A02-01 admin eligible payout allocation contract", () => {
  it("hydrates roster and team-member payouts through the canonical per-cleaner resolver", () => {
    const root = path.resolve(process.cwd(), "../..");
    const source = readFileSync(
      path.join(root, "apps/web/app/api/admin/payouts/eligible/route.ts"),
      "utf8",
    );

    expect(source).toContain("loadRosterByBookingIds");
    expect(source).toContain("loadTeamJobMemberPayoutsByBookingIds");
    expect(source).toContain("perCleanerAllocationsForBooking");
    expect(source).toContain("earnings_summary, metadata");
    expect(source).not.toContain("function payrollKey");
    expect(source).not.toContain("function amountCents");
  });
});
