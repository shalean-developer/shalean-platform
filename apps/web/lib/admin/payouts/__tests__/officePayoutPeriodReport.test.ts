import { describe, expect, it } from "vitest";
import {
  bookingCompanyEarningsCents,
  bookingCustomerRevenueCents,
  classifyBookingPayoutBucket,
  defaultOfficePayoutPeriodRange,
  normalizeOfficePayoutPeriodRange,
  payoutPeriodOverlapsRange,
  perCleanerAllocationsForBooking,
} from "@/lib/admin/payouts/officePayoutPeriodReport";

describe("officePayoutPeriodReport", () => {
  it("defaults to the full monthly payout month from July 2026", () => {
    expect(defaultOfficePayoutPeriodRange(new Date("2026-06-19T10:00:00+02:00"))).toEqual({
      from: "2026-07-01",
      to: "2026-07-31",
    });
    expect(defaultOfficePayoutPeriodRange(new Date("2026-07-07T10:00:00+02:00"))).toEqual({
      from: "2026-07-01",
      to: "2026-07-31",
    });
  });

  it("clamps report range to the monthly payout epoch", () => {
    expect(normalizeOfficePayoutPeriodRange("2026-06-01", "2026-06-19")).toEqual({
      from: "2026-07-01",
      to: "2026-07-01",
    });
  });

  it("swaps inverted from/to after monthly epoch clamp", () => {
    expect(normalizeOfficePayoutPeriodRange("2026-07-19", "2026-07-01")).toEqual({
      from: "2026-07-01",
      to: "2026-07-19",
    });
  });

  it("detects overlapping weekly payout periods", () => {
    expect(payoutPeriodOverlapsRange("2026-05-26", "2026-06-01", "2026-06-01", "2026-06-19")).toBe(true);
    expect(payoutPeriodOverlapsRange("2026-05-19", "2026-05-25", "2026-06-01", "2026-06-19")).toBe(false);
  });

  it("classifies booking payout buckets", () => {
    const batches = new Map<string, string>([["batch-1", "pending"], ["batch-2", "paid"]]);
    expect(classifyBookingPayoutBucket("paid", null, batches)).toBe("paid");
    expect(classifyBookingPayoutBucket("eligible", "batch-1", batches)).toBe("batched_open");
    expect(classifyBookingPayoutBucket("eligible", "batch-2", batches)).toBe("paid");
    expect(classifyBookingPayoutBucket("eligible", null, batches)).toBe("eligible");
    expect(classifyBookingPayoutBucket("pending", null, batches)).toBe("pending");
  });

  it("credits roster members display earnings when earnings JSON lists only the lead", () => {
    const nyasha = "796e3ad7-07f3-44eb-b4cf-bed439a59f8b";
    const ethel = "914b3acf-40e8-4ad5-a5a2-9e2de711849a";
    const allocs = perCleanerAllocationsForBooking(
      {
        cleaner_id: nyasha,
        payout_owner_cleaner_id: null,
        payout_frozen_cents: null,
        display_earnings_cents: 30000,
        cleaner_earnings_total_cents: 42700,
        cleaner_payout_cents: null,
        earnings_summary: {
          model_version: "v3",
          per_cleaner_earnings: [
            { cleaner_id: nyasha, role: "lead", base_earning_cents: 30000, bonus_cents: 0, deduction_cents: 0, total_cents: 30000 },
          ],
        },
      },
      [
        { cleaner_id: nyasha, role: "lead" },
        { cleaner_id: ethel, role: "member" },
      ],
    );
    expect(allocs).toEqual([
      { cleaner_id: nyasha, cents: 30000 },
      { cleaner_id: ethel, cents: 30000 },
    ]);
  });

  it("derives customer revenue from paid columns and earnings summary fallback", () => {
    expect(
      bookingCustomerRevenueCents({
        total_paid_zar: 450,
        amount_paid_cents: null,
        total_paid_cents: null,
        earnings_summary: null,
      }),
    ).toBe(45000);
    expect(
      bookingCustomerRevenueCents({
        total_paid_zar: null,
        amount_paid_cents: 51200,
        total_paid_cents: null,
        earnings_summary: null,
      }),
    ).toBe(51200);
    expect(
      bookingCustomerRevenueCents({
        total_paid_zar: null,
        amount_paid_cents: null,
        total_paid_cents: null,
        earnings_summary: { model_version: "v3", customer_total_cents: 60000, per_cleaner_earnings: [] },
      }),
    ).toBe(60000);
  });

  it("derives company earnings from stored column and summary fallback", () => {
    expect(
      bookingCompanyEarningsCents({
        company_revenue_cents: 12500,
        earnings_summary: null,
      }),
    ).toBe(12500);
    expect(
      bookingCompanyEarningsCents({
        company_revenue_cents: null,
        earnings_summary: { model_version: "v3", company_revenue_cents: 9800, per_cleaner_earnings: [] },
      }),
    ).toBe(9800);
  });
});
