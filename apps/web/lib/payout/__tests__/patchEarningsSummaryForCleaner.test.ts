import { describe, expect, it } from "vitest";
import { patchEarningsSummaryForCleaner } from "@/lib/payout/bookingEarningsSummary";

describe("patchEarningsSummaryForCleaner", () => {
  it("updates per-cleaner totals used by the payouts visit list", () => {
    const summary = {
      model_version: "v3",
      customer_total_cents: 50000,
      costs_cents: 0,
      per_cleaner_earnings: [
        {
          cleaner_id: "e8f12d90-4212-4ac7-ad85-620c6a744d56",
          role: "member" as const,
          base_earning_cents: 30000,
          bonus_cents: 0,
          deduction_cents: 0,
          total_cents: 30000,
        },
      ],
      total_cleaner_earnings_cents: 30000,
      company_revenue_cents: 20000,
      bonus: { items: [], total_cents: 0 },
      deductions: { items: [], total_cents: 0 },
      service_type: "standard",
      eligible_amount_cents: 60000,
      payout_mode: "individual_cleaners" as const,
      cleaner_count: 1,
      assigned_cleaner_ids: ["e8f12d90-4212-4ac7-ad85-620c6a744d56"],
      assigned_team_id: null,
      team_leader_id: null,
      cleaner_tenure_months: 2,
      cleaner_percentage: 0.6,
      minimum_earning_cents: 25000,
      maximum_earning_cents: 30000,
      fixed_service_payout_applied: false,
      team_leader_earning_cents: null,
      computed_at: "2026-07-07T05:32:15.313Z",
    };

    const patched = patchEarningsSummaryForCleaner(
      summary,
      "e8f12d90-4212-4ac7-ad85-620c6a744d56",
      25000,
      0,
    );

    expect(patched?.per_cleaner_earnings[0]?.total_cents).toBe(25000);
    expect(patched?.total_cleaner_earnings_cents).toBe(25000);
    expect(patched?.company_revenue_cents).toBe(25000);
  });
});
