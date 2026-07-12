import { describe, expect, it } from "vitest";
import { applyVipToCleaningSubtotalZar } from "@shalean/pricing";

/**
 * Regression: UI showed R410 (no VIP) while Paystack charged R353 (platinum).
 * Cleaning R380 − 15% = R323 + R30 fee = R353.
 */
describe("VIP display/charge parity regression", () => {
  it("platinum 15% on R380 cleaning yields R57 discount", () => {
    const vip = applyVipToCleaningSubtotalZar(380, "platinum");
    expect(vip.vipDiscountZar).toBe(57);
    expect(vip.cleaningSubtotalAfterVipZar).toBe(323);
  });

  it("UI total without VIP vs charge with VIP matches observed R410 / R353", () => {
    const cleaning = 380;
    const fee = 30;
    const uiTotal = cleaning + fee; // no VIP
    expect(uiTotal).toBe(410);

    const vip = applyVipToCleaningSubtotalZar(cleaning, "platinum");
    const chargeTotal = vip.cleaningSubtotalAfterVipZar + fee;
    expect(chargeTotal).toBe(353);
    expect(uiTotal - chargeTotal).toBe(57);
  });
});
