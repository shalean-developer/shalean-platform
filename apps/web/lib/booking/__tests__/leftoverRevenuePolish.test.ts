import { describe, expect, it } from "vitest";
import { resolveTotalPaidCents, resolvePayoutBaseAndServiceFeeCents } from "@/lib/payout/calculateCleanerPayout";

describe("leftover revenue polish", () => {
  it("excludes tip_zar from paid-total fallback payout base", () => {
    const r = resolvePayoutBaseAndServiceFeeCents({
      baseAmountCents: null,
      serviceFeeCents: null,
      totalPaidZar: null,
      amountPaidCents: 55_000, // R550 paid incl R50 tip
      priceSnapshot: { tip_zar: 50 },
    });
    expect(r.payoutBaseCents).toBe(50_000);
    expect(r.serviceFeeCents).toBe(0);
  });

  it("keeps amount_paid_cents preferred", () => {
    expect(resolveTotalPaidCents(100, 5000)).toBe(5000);
  });
});
