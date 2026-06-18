import { describe, expect, it } from "vitest";
import { adminBookingVisitPricingSplit, inferAdminServiceTypeSlug, parseAdminBookingPriceSnapshot } from "@/lib/booking/priceSnapshotAdminDisplay";

describe("parseAdminBookingPriceSnapshot", () => {
  it("parses legacy v:1 snapshots", () => {
    const raw = {
      v: 1,
      service_type: "standard",
      base_price: 400,
      extras: [{ id: "inside-oven", name: "Inside oven", price: 59 }],
      total_price: 459,
    };
    const out = parseAdminBookingPriceSnapshot(raw, { serviceSlug: null, serviceLabel: null });
    expect(out).toEqual(raw);
  });

  it("parses checkout version:1 snapshots from Paystack finalize", () => {
    const raw = {
      version: 1,
      currency: "ZAR",
      total_zar: 520,
      subtotal_zar: 450,
      extras_total_zar: 80,
      discount_zar: 0,
      tip_zar: 70,
      visit_total_zar: 450,
      duration_hours: 3,
      cleaners_count: 1,
      line_items: [
        { id: "standard", name: "Service base", amount_zar: 200 },
        { id: "line", name: "Rooms, bathrooms & duration", amount_zar: 170 },
        { id: "extra", name: "Add-ons (subtotal)", amount_zar: 80 },
      ],
      pricing_version_id: null as string | null,
    };
    const out = parseAdminBookingPriceSnapshot(raw, { serviceSlug: "standard", serviceLabel: "Standard Cleaning" });
    expect(out).not.toBeNull();
    expect(out!.service_type).toBe("standard");
    expect(out!.base_price).toBe(370);
    expect(out!.extras).toEqual([{ id: "extra", name: "Add-ons (subtotal)", price: 80 }]);
    expect(out!.total_price).toBe(450);
  });

  it("falls back to extras_total when line_items omit add-on rows", () => {
    const raw = {
      version: 1,
      currency: "ZAR",
      total_zar: 400,
      subtotal_zar: 350,
      extras_total_zar: 40,
      discount_zar: 0,
      tip_zar: 0,
      visit_total_zar: 350,
      duration_hours: 2,
      cleaners_count: 1,
      line_items: [] as { id: string; name: string; amount_zar: number }[],
      pricing_version_id: null as string | null,
    };
    const out = parseAdminBookingPriceSnapshot(raw, { serviceSlug: null, serviceLabel: "Deep Clean" });
    expect(out).not.toBeNull();
    expect(out!.extras).toEqual([{ id: "addons-subtotal", name: "Add-ons (subtotal)", price: 40 }]);
    expect(out!.base_price).toBe(310);
  });
});

describe("adminBookingVisitPricingSplit", () => {
  it("uses price_snapshot instead of estimated splits", () => {
    const out = adminBookingVisitPricingSplit({
      total_price: 450,
      total_paid_zar: 0,
      amount_paid_cents: 0,
      price_snapshot: {
        v: 1,
        service_type: "standard",
        base_price: 383,
        extras: [{ id: "oven", name: "Inside oven", price: 67 }],
        total_price: 450,
      },
      service: "Standard Cleaning",
      service_slug: "standard",
    });
    expect(out).toEqual({ basePrice: 383, extrasPrice: 67, total: 450 });
  });

  it("prefers total_price for unpaid bookings", () => {
    const out = adminBookingVisitPricingSplit({
      total_price: 450,
      total_paid_zar: 0,
      base_amount_cents: 38300,
      amount_paid_cents: 0,
      service: "Standard Cleaning",
    });
    expect(out.total).toBe(450);
    expect(out.basePrice).toBe(383);
  });
});

describe("inferAdminServiceTypeSlug", () => {
  it("prefers explicit slug", () => {
    expect(inferAdminServiceTypeSlug("deep", "Anything")).toBe("deep");
  });

  it("infers from label", () => {
    expect(inferAdminServiceTypeSlug(null, "Airbnb turnover")).toBe("airbnb");
  });

  it("maps historical Quick labels to Standard instead of exposing quick", () => {
    expect(inferAdminServiceTypeSlug("quick", "Quick clean")).toBe("standard");
    expect(inferAdminServiceTypeSlug(null, "Quick Cleaning")).toBe("standard");
  });
});
