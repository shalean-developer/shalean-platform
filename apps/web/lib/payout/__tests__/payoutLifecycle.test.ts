import { describe, expect, it } from "vitest";
import { presentMonthlyPayoutLifecycle } from "@/lib/payout/payoutLifecycle";

describe("monthly payout lifecycle presentation", () => {
  const august = { periodEnd: "2026-08-31", now: new Date("2026-08-11T21:00:00Z") };

  it("presents an open month as accrual, not payable", () => {
    expect(presentMonthlyPayoutLifecycle({ ...august, status: "pending", fundingGapCents: 0 })).toMatchObject({
      stage: "accruing",
      label: "Month-to-date earnings",
      payableNow: false,
    });
  });

  it("presents a closed underfunded month as a funding gap", () => {
    expect(
      presentMonthlyPayoutLifecycle({
        periodEnd: "2026-07-31",
        now: new Date("2026-08-11T21:00:00Z"),
        status: "pending",
        fundingGapCents: 125000,
      }),
    ).toMatchObject({ stage: "reconciled", label: "Closed — funding gap", payableNow: false });
  });

  it("presents a frozen fully funded closed month as funded", () => {
    expect(
      presentMonthlyPayoutLifecycle({
        periodEnd: "2026-07-31",
        now: new Date("2026-08-11T21:00:00Z"),
        status: "frozen",
        fundingGapCents: 0,
      }),
    ).toMatchObject({ stage: "funded", label: "Funded monthly payout", payableNow: false });
  });

  it("only marks approved closed payouts as payable now", () => {
    expect(
      presentMonthlyPayoutLifecycle({
        periodEnd: "2026-07-31",
        now: new Date("2026-08-11T21:00:00Z"),
        status: "approved",
        fundingGapCents: 0,
      }),
    ).toMatchObject({ stage: "approved", payableNow: true });
  });
});
