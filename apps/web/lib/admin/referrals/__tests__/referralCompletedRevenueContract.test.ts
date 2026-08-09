import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("P7 referral completed-revenue contract", () => {
  it("bounds attribution and reward events to the selected period and separates completed revenue", () => {
    const source = readFileSync(
      join(process.cwd(), "lib/admin/referrals/loadReferralFinanceDashboard.ts"),
      "utf8",
    );

    expect(source).toContain('loadPeriodReferralEvents(admin, "checkout_discount_applied"');
    expect(source).toContain('loadPeriodReferralEvents(admin, "referral_reward_credited"');
    expect(source).toContain("johannesburgDayUtcBounds(from)");
    expect(source).toContain("johannesburgDayUtcBounds(to).endExclusiveIso");
    expect(source).toContain('.lt("created_at", endExclusiveIso)');
    expect(source).toContain(".range(fromIndex, fromIndex + pageSize - 1)");
    expect(source).toContain("unique.slice(i, i + 100)");
    expect(source).toContain("isAdminDashboardRevenueEligible(booking)");
    expect(source).toContain("adminDashboardRevenueCents(booking)");
    expect(source).toContain('toLowerCase() === "completed"');
    expect(source).toContain("completed_referred_revenue_cents");
    expect(source).toContain("paid_attributed_revenue_cents");
  });
});
