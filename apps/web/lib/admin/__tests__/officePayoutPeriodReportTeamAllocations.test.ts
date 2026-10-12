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

  it("uses one authoritative member payout for a roster cleaner missing from the summary", () => {
    const allocs = perCleanerAllocationsForBooking(
      {
        earnings_summary: {
          per_cleaner_earnings: [
            {
              cleaner_id: LORRAINE,
              role: "lead",
              base_earning_cents: 30000,
              bonus_cents: 0,
              deduction_cents: 0,
              total_cents: 30000,
            },
          ],
        },
        cleaner_id: LORRAINE,
        payout_owner_cleaner_id: LORRAINE,
        display_earnings_cents: 30000,
        cleaner_payout_cents: 30000,
        cleaner_earnings_total_cents: 55000,
        payout_frozen_cents: 30000,
      },
      [
        { cleaner_id: LORRAINE, role: "lead" },
        { cleaner_id: THANDEKA, role: "member" },
      ],
      [{ cleaner_id: THANDEKA, payout_cents: 25000 }],
    );

    expect(allocs.filter((a) => a.cleaner_id === THANDEKA)).toEqual([
      { cleaner_id: THANDEKA, cents: 25000 },
    ]);
  });

  it("uses canonical team member payout rows over stale team summary amounts", () => {
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
            {
              cleaner_id: THANDEKA,
              role: "member",
              base_earning_cents: 25000,
              bonus_cents: 0,
              deduction_cents: 0,
              total_cents: 25000,
            },
          ],
        },
        cleaner_id: LORRAINE,
        payout_owner_cleaner_id: LORRAINE,
        display_earnings_cents: 25000,
        cleaner_payout_cents: 0,
        cleaner_earnings_total_cents: 52000,
        payout_frozen_cents: 25000,
      },
      [
        { cleaner_id: LORRAINE, role: "lead" },
        { cleaner_id: THANDEKA, role: "member" },
      ],
      [
        { cleaner_id: LORRAINE, payout_cents: 30000 },
        { cleaner_id: THANDEKA, payout_cents: 30000 },
      ],
    );

    expect(allocs).toEqual(
      expect.arrayContaining([
        { cleaner_id: LORRAINE, cents: 30000 },
        { cleaner_id: THANDEKA, cents: 30000 },
      ]),
    );
    expect(allocs.reduce((sum, row) => sum + row.cents, 0)).toBe(60000);
  });

  it("attributes a summary-only solo earning when booking owner columns are null", () => {
    const allocs = perCleanerAllocationsForBooking(
      {
        earnings_summary: {
          per_cleaner_earnings: [
            {
              cleaner_id: THANDEKA,
              role: "member",
              base_earning_cents: 30000,
              bonus_cents: 0,
              deduction_cents: 0,
              total_cents: 30000,
            },
          ],
        },
        cleaner_id: null,
        payout_owner_cleaner_id: null,
        display_earnings_cents: 30000,
        cleaner_payout_cents: 30000,
        cleaner_earnings_total_cents: 30000,
        payout_frozen_cents: 30000,
      },
      [],
      [],
    );

    expect(allocs).toEqual([{ cleaner_id: THANDEKA, cents: 30000 }]);
  });


  it("uses canonical paired-roster payout rows over a booking-wide freeze", () => {
    const allocs = perCleanerAllocationsForBooking(
      {
        earnings_summary: {
          per_cleaner_earnings: [
            {
              cleaner_id: LORRAINE,
              role: "lead",
              base_earning_cents: 26000,
              bonus_cents: 0,
              deduction_cents: 0,
              total_cents: 26000,
            },
            {
              cleaner_id: THANDEKA,
              role: "member",
              base_earning_cents: 26000,
              bonus_cents: 0,
              deduction_cents: 0,
              total_cents: 26000,
            },
          ],
        },
        cleaner_id: LORRAINE,
        payout_owner_cleaner_id: LORRAINE,
        display_earnings_cents: 26000,
        cleaner_payout_cents: 26000,
        cleaner_earnings_total_cents: 52000,
        payout_frozen_cents: 52000,
      },
      [
        { cleaner_id: LORRAINE, role: "lead" },
        { cleaner_id: THANDEKA, role: "member" },
      ],
      [
        { cleaner_id: LORRAINE, payout_cents: 26000 },
        { cleaner_id: THANDEKA, payout_cents: 26000 },
      ],
    );

    expect(allocs).toEqual(
      expect.arrayContaining([
        { cleaner_id: LORRAINE, cents: 26000 },
        { cleaner_id: THANDEKA, cents: 26000 },
      ]),
    );
    expect(allocs.reduce((sum, row) => sum + row.cents, 0)).toBe(52000);
  });

});
