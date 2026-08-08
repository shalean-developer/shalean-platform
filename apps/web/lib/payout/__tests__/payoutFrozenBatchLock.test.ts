import { describe, expect, it } from "vitest";
import {
  resolveDirectPayoutBatchAmounts,
  resolveDirectPayoutBatchCents,
} from "@/lib/payout/loadCleanerPayoutBatchItems";

describe("resolveDirectPayoutBatchCents", () => {
  it("uses the frozen settlement lock for eligible bookings", () => {
    expect(
      resolveDirectPayoutBatchCents({
        payout_status: "eligible",
        payout_frozen_cents: 26_670,
        cleaner_payout_cents: 25_000,
      }),
    ).toBe(26_670);
  });

  it("uses the frozen settlement lock for paid bookings", () => {
    expect(
      resolveDirectPayoutBatchCents({
        payout_status: "paid",
        payout_frozen_cents: 25_000,
        cleaner_payout_cents: 27_000,
      }),
    ).toBe(25_000);
  });

  it("keeps pre-freeze payout adjustments editable", () => {
    expect(
      resolveDirectPayoutBatchCents({
        payout_status: "pending",
        payout_frozen_cents: 25_000,
        cleaner_payout_cents: 28_000,
      }),
    ).toBe(28_000);
  });

  it("falls back to cleaner payout when an eligible row has no positive freeze", () => {
    expect(
      resolveDirectPayoutBatchCents({
        payout_status: "eligible",
        payout_frozen_cents: 0,
        cleaner_payout_cents: 25_000,
      }),
    ).toBe(25_000);
  });
});

describe("resolveDirectPayoutBatchAmounts", () => {
  it("does not add bonus again after the frozen total already includes it", () => {
    expect(
      resolveDirectPayoutBatchAmounts({
        payout_status: "eligible",
        payout_frozen_cents: 27_000,
        cleaner_payout_cents: 25_000,
        cleaner_bonus_cents: 2_000,
      }),
    ).toEqual({ payout_cents: 27_000, bonus_cents: 0 });
  });

  it("keeps base and bonus separate before settlement is frozen", () => {
    expect(
      resolveDirectPayoutBatchAmounts({
        payout_status: "pending",
        payout_frozen_cents: 27_000,
        cleaner_payout_cents: 25_000,
        cleaner_bonus_cents: 2_000,
      }),
    ).toEqual({ payout_cents: 25_000, bonus_cents: 2_000 });
  });
});
