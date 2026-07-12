import { describe, expect, it } from "vitest";
import { resolveTotalPaidCents } from "@/lib/payout/calculateCleanerPayout";
import { isLegacyBookingLockEnabled, CUSTOMER_PRICING_SOT } from "@/lib/booking/customerPricingSot";
import {
  computeServiceFeeCentsFromBaseZar,
  DEFAULT_BOOKING_SERVICE_FEE_CENTS,
} from "@/lib/booking/serviceFee";

describe("Phase 4 revenue polish", () => {
  it("keeps booking_v2 as customer pricing SoT", () => {
    expect(CUSTOMER_PRICING_SOT).toBe("booking_v2");
  });

  it("disables new legacy locks by default", () => {
    const prev = process.env.LEGACY_BOOKING_LOCK_ENABLED;
    delete process.env.LEGACY_BOOKING_LOCK_ENABLED;
    expect(isLegacyBookingLockEnabled()).toBe(false);
    process.env.LEGACY_BOOKING_LOCK_ENABLED = "true";
    expect(isLegacyBookingLockEnabled()).toBe(true);
    if (prev == null) delete process.env.LEGACY_BOOKING_LOCK_ENABLED;
    else process.env.LEGACY_BOOKING_LOCK_ENABLED = prev;
  });

  it("prefers amount_paid_cents over disagreeing total_paid_zar", () => {
    // zar says R100, cents say R50 — cents win (gateway SoT)
    expect(resolveTotalPaidCents(100, 5000)).toBe(5000);
    expect(resolveTotalPaidCents(100, null)).toBe(10000);
    expect(resolveTotalPaidCents(null, 2500)).toBe(2500);
    expect(resolveTotalPaidCents(0, 0)).toBe(0);
  });

  it("ignores BOOKING_SERVICE_FEE_CENTS env unless legacy flag is on", () => {
    const prevFlag = process.env.LEGACY_ENV_SERVICE_FEE_ENABLED;
    const prevCents = process.env.BOOKING_SERVICE_FEE_CENTS;
    delete process.env.LEGACY_ENV_SERVICE_FEE_ENABLED;
    process.env.BOOKING_SERVICE_FEE_CENTS = "9999";
    expect(computeServiceFeeCentsFromBaseZar(100)).toBe(DEFAULT_BOOKING_SERVICE_FEE_CENTS);

    process.env.LEGACY_ENV_SERVICE_FEE_ENABLED = "true";
    expect(computeServiceFeeCentsFromBaseZar(100)).toBe(9999);

    if (prevFlag == null) delete process.env.LEGACY_ENV_SERVICE_FEE_ENABLED;
    else process.env.LEGACY_ENV_SERVICE_FEE_ENABLED = prevFlag;
    if (prevCents == null) delete process.env.BOOKING_SERVICE_FEE_CENTS;
    else process.env.BOOKING_SERVICE_FEE_CENTS = prevCents;
  });
});
