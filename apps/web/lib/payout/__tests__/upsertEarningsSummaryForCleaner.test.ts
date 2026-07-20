import { describe, expect, it } from "vitest";
import {
  patchEarningsSummaryForCleaner,
  upsertEarningsSummaryForCleaner,
  type BookingEarningsSummary,
} from "@/lib/payout/bookingEarningsSummary";

const LEAD = "015e91e8-df25-4fde-8db1-a5901b005ae3";
const MEMBER = "ac73ea99-48b3-4c30-9d6b-5a8beab40f33";

function baseSummary(overrides?: Partial<BookingEarningsSummary>): BookingEarningsSummary {
  return {
    model_version: "v3",
    service_type: "standard",
    customer_total_cents: 60000,
    eligible_amount_cents: 60000,
    payout_mode: "individual_cleaners",
    cleaner_count: 1,
    assigned_cleaner_ids: [LEAD],
    assigned_team_id: null,
    team_leader_id: LEAD,
    cleaner_tenure_months: 4,
    cleaner_percentage: 70,
    minimum_earning_cents: 25000,
    maximum_earning_cents: 30000,
    fixed_service_payout_applied: false,
    per_cleaner_earnings: [
      {
        cleaner_id: LEAD,
        role: "lead",
        base_earning_cents: 27000,
        bonus_cents: 0,
        deduction_cents: 0,
        total_cents: 27000,
      },
    ],
    team_leader_earning_cents: 27000,
    bonus: { items: [], total_cents: 0 },
    deductions: { items: [], total_cents: 0 },
    total_cleaner_earnings_cents: 27000,
    costs_cents: 0,
    company_revenue_cents: 33000,
    computed_at: "2026-07-20T00:00:00.000Z",
    ...overrides,
  };
}

describe("upsertEarningsSummaryForCleaner", () => {
  it("patches an existing cleaner", () => {
    const updated = upsertEarningsSummaryForCleaner(baseSummary(), LEAD, 28000, 0);
    expect(updated?.per_cleaner_earnings[0]?.total_cents).toBe(28000);
    expect(updated?.total_cleaner_earnings_cents).toBe(28000);
  });

  it("inserts a missing member used by TJ-only office allocations", () => {
    const updated = upsertEarningsSummaryForCleaner(baseSummary(), MEMBER, 30000, 0, "member");
    expect(updated?.per_cleaner_earnings).toHaveLength(2);
    expect(updated?.per_cleaner_earnings.find((r) => r.cleaner_id === MEMBER)?.total_cents).toBe(30000);
    expect(updated?.total_cleaner_earnings_cents).toBe(57000);
    expect(patchEarningsSummaryForCleaner(baseSummary(), MEMBER, 30000, 0)).toBeNull();
  });
});
