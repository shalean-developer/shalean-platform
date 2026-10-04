import { describe, expect, it } from "vitest";
import { resolvedRevenueCents } from "@/lib/admin/computeFinancialDashboard";

describe("BOOKING-E2E-02 financial collected-cash truth", () => {
  it("prefers exact amount_paid_cents over rounded legacy total_paid_zar", () => {
    expect(resolvedRevenueCents({
      id: "b1",
      amount_paid_cents: 25_050,
      total_paid_zar: 251,
      cleaner_payout_cents: 0,
      company_revenue_cents: 25_050,
      location: null,
      cleaner_id: null,
      created_at: null,
      status: "completed",
    })).toBe(25_050);
  });

  it("uses legacy ZAR only when exact cents are unavailable", () => {
    expect(resolvedRevenueCents({
      id: "legacy",
      total_paid_zar: 250,
      cleaner_payout_cents: 0,
      company_revenue_cents: 25_000,
      location: null,
      cleaner_id: null,
      created_at: null,
      status: "completed",
    })).toBe(25_000);
  });

  it("does not replace an explicit zero-cent collected amount with a stale legacy mirror", () => {
    expect(resolvedRevenueCents({
      id: "pending-anomaly",
      amount_paid_cents: 0,
      total_paid_zar: 250,
      cleaner_payout_cents: 0,
      company_revenue_cents: 0,
      location: null,
      cleaner_id: null,
      created_at: null,
      status: "completed",
    })).toBe(0);
  });
});
