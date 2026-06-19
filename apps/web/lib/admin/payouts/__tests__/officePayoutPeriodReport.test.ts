import { describe, expect, it } from "vitest";
import {
  classifyBookingPayoutBucket,
  defaultOfficePayoutPeriodRange,
  normalizeOfficePayoutPeriodRange,
  payoutPeriodOverlapsRange,
  perCleanerAllocationsForBooking,
} from "@/lib/admin/payouts/officePayoutPeriodReport";

describe("officePayoutPeriodReport", () => {
  it("defaults to month start through today in Johannesburg", () => {
    const { from, to } = defaultOfficePayoutPeriodRange(new Date("2026-06-19T10:00:00+02:00"));
    expect(from).toBe("2026-06-01");
    expect(to).toBe("2026-06-19");
  });

  it("swaps inverted from/to", () => {
    expect(normalizeOfficePayoutPeriodRange("2026-06-19", "2026-06-01")).toEqual({
      from: "2026-06-01",
      to: "2026-06-19",
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
        id: "b1",
        date: "2026-06-01",
        cleaner_id: nyasha,
        payout_owner_cleaner_id: null,
        payout_status: "pending",
        payout_id: null,
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
});
