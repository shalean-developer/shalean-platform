import { describe, expect, it } from "vitest";
import {
  checkoutSidebarPriceDisplay,
  checkoutSummaryPriceLabel,
  hasCheckoutSelectedTime,
} from "@/lib/booking/checkoutSidebarPricing";
import { dedupeCommaSegments, formatCheckoutAddress } from "@/lib/booking/formatCheckoutAddress";

describe("formatCheckoutAddress", () => {
  it("dedupes repeated comma segments", () => {
    expect(dedupeCommaSegments("Cape Town CBD (8001), Cape Town CBD (8001)")).toBe("Cape Town CBD (8001)");
  });

  it("combines area and street without repeating area in street", () => {
    expect(
      formatCheckoutAddress({
        serviceAreaName: "Cape Town",
        streetAddress: "20 Warbreck Road, Cape Town CBD",
      }),
    ).toBe("20 Warbreck Road, Cape Town CBD");
  });

  it("joins area and street when distinct", () => {
    expect(
      formatCheckoutAddress({
        serviceAreaName: "Cape Town",
        streetAddress: "20 Warbreck Road",
      }),
    ).toBe("Cape Town — 20 Warbreck Road");
  });
});

describe("checkoutSidebarPriceDisplay", () => {
  it("uses EST. PRICE label before time is selected", () => {
    expect(checkoutSummaryPriceLabel(2, false)).toBe("EST. PRICE");
    expect(hasCheckoutSelectedTime(null)).toBe(false);
  });

  it("uses BOOKING PRICE on schedule step after time is selected", () => {
    expect(checkoutSummaryPriceLabel(2, true)).toBe("BOOKING PRICE");
    expect(hasCheckoutSelectedTime("08:00")).toBe(true);
  });

  it("returns zero totals without catalog snapshot", () => {
    const r = checkoutSidebarPriceDisplay({
      snapshot: null,
      segment: "schedule",
      service: "standard",
      bedrooms: 2,
      bathrooms: 1,
      extraRooms: 0,
      extras: [],
      time: "08:00",
    });
    expect(r.totalZar).toBe(0);
    expect(r.priceLabel).toBe("BOOKING PRICE");
  });
});
