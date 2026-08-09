import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("P7 referral completed-revenue contract", () => {
  it("bounds attribution and reward events to the selected period and separates completed revenue", () => {
    const source = readFileSync(
      join(process.cwd(), "lib/admin/referrals/loadReferralFinanceDashboard.ts"),
      "utf8",
    );

    expect(source).toContain('.eq("event_type", "checkout_discount_applied")');
    expect(source).toContain('.eq("event_type", "referral_reward_credited")');
    expect(source).toContain('.gte("created_at", `${from}T00:00:00`)');
    expect(source).toContain('.lte("created_at", `${to}T23:59:59`)');
    expect(source).toContain('toLowerCase() === "completed"');
    expect(source).toContain("completed_referred_revenue_cents");
    expect(source).toContain("paid_attributed_revenue_cents");
  });
});
