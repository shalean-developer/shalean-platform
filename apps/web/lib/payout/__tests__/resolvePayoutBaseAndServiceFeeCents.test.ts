import { describe, expect, it } from "vitest";
import { resolvePayoutBaseAndServiceFeeCents } from "@/lib/payout/calculateCleanerPayout";

describe("resolvePayoutBaseAndServiceFeeCents", () => {
  it("uses quoted base when customer total is not recorded yet (base + fee > total=0)", () => {
    const r = resolvePayoutBaseAndServiceFeeCents({
      baseAmountCents: 45_000,
      serviceFeeCents: 5_000,
      totalPaidZar: null,
      amountPaidCents: null,
    });
    expect(r).toEqual({ payoutBaseCents: 45_000, serviceFeeCents: 5_000 });
  });

  it("falls back to price_snapshot.base_price when base_amount_cents is missing", () => {
    const r = resolvePayoutBaseAndServiceFeeCents({
      baseAmountCents: null,
      serviceFeeCents: null,
      totalPaidZar: null,
      amountPaidCents: null,
      priceSnapshot: { v: 1, base_price: 380, total_price: 420 },
    });
    expect(r.payoutBaseCents).toBe(380);
  });

  it("caps payout base to recorded customer total when both are present", () => {
    const r = resolvePayoutBaseAndServiceFeeCents({
      baseAmountCents: 50_000,
      serviceFeeCents: 5_000,
      totalPaidZar: 400,
      amountPaidCents: 40_000,
    });
    expect(r).toEqual({ payoutBaseCents: 40_000, serviceFeeCents: 0 });
  });
});
