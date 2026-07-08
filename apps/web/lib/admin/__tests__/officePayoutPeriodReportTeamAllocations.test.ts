import { describe, expect, it } from "vitest";
import { perCleanerAllocationsForBooking } from "@/lib/admin/payouts/officePayoutPeriodReport";

const THANDEKA = "ac73ea99-48b3-4c30-9d6b-5a8beab40f33";
const LORRAINE = "015e91e8-df25-4fde-8db1-a5901b005ae3";

describe("perCleanerAllocationsForBooking team_job_member_payouts fallback", () => {
  it("includes team member payout rows missing from earnings_summary", () => {
    const allocs = perCleanerAllocationsForBooking(
      {
        earnings_summary: {
          per_cleaner_earnings: [
            {
              cleaner_id: LORRAINE,
              role: "lead",
              base_earning_cents: 27000,
              bonus_cents: 0,
              deduction_cents: 0,
              total_cents: 27000,
            },
          ],
        },
        cleaner_id: LORRAINE,
        payout_owner_cleaner_id: LORRAINE,
        display_earnings_cents: 25000,
        cleaner_payout_cents: 0,
        cleaner_earnings_total_cents: null,
        payout_frozen_cents: null,
      },
      [{ cleaner_id: LORRAINE, role: "lead" }],
      [{ cleaner_id: THANDEKA, payout_cents: 25000 }],
    );

    expect(allocs.find((a) => a.cleaner_id === THANDEKA)).toEqual({
      cleaner_id: THANDEKA,
      cents: 25000,
    });
    expect(allocs.some((a) => a.cleaner_id === LORRAINE)).toBe(true);
  });
});
