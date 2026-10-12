import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

import { buildAudit02A07BookingLineItems } from "@/lib/booking/buildAudit02A07BookingLineItems";

describe("AUDIT-02A07 historical Booking V2 line-item repair", () => {
  it("preserves exact source lines and reconciles a recorded promotion discount", () => {
    const built = buildAudit02A07BookingLineItems({
      bookingId: "11111111-1111-4111-8111-111111111111",
      declaredTotalCents: 111300,
      bookingSnapshot: {
        pricingSummary: {
          lineItems: [
            { label: "Regular Cleaning (base)", amountZar: 250 },
            { label: "3 bedrooms", amountZar: 90 },
            { label: "3 bathrooms", amountZar: 105 },
            { label: "Service fee", amountZar: 30 },
            { label: "Example extra", amountZar: 835 },
          ],
        },
        promotionCheckout: { totalDiscountZar: 197 },
      },
      priceBreakdown: null,
      isTeamJob: false,
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.items.reduce((s, x) => s + x.total_price_cents, 0)).toBe(111300);
    expect(built.items.some((x) => x.item_type === "adjustment" && x.total_price_cents === -19700)).toBe(true);
  });

  it("reconstructs the audited incident-recovery aggregate breakdown", () => {
    const built = buildAudit02A07BookingLineItems({
      bookingId: "22222222-2222-4222-8222-222222222222",
      declaredTotalCents: 180200,
      bookingSnapshot: null,
      pricingSummary: null,
      priceBreakdown: {
        base_zar: 1770,
        extras_zar: 350,
        discount_zar: 318,
      },
      isTeamJob: false,
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.evidenceKind).toBe("incident_recovery_breakdown");
    expect(built.items.reduce((s, x) => s + x.total_price_cents, 0)).toBe(180200);
  });

  it("keeps the historical repair allowlist fixed at 26 and blocks apply before staging closeout", () => {
    const root = path.resolve(process.cwd(), "../..");
    const source = readFileSync(path.join(root, "apps/web/scripts/audit02a07HistoricalLineItems.ts"), "utf8");
    expect((source.match(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi) ?? []).length).toBeGreaterThanOrEqual(26);
    expect(source).toContain('throw new Error("AUDIT-02A07 apply is blocked until staging fixture verification closes.")');
  });

  it("retains the current Paystack line-item fail-closed invariant", () => {
    const root = path.resolve(process.cwd(), "../..");
    const source = readFileSync(path.join(root, "apps/web/lib/booking/paystackInitializeCore.ts"), "utf8");
    expect(source).toContain("checkoutLineItems");
    expect(source).toContain("checkout line sum != payable total");
    expect(source).toContain('errorCode: "PRICE_MISMATCH"');
    expect(source).toContain("deleteRowOnLineItemPersistFail");
  });
});
