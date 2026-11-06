import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renewFcoEquipmentForCheckout } from "@/lib/booking-v2/renewFcoEquipmentForCheckout";
import type { BookingV2FormData } from "@/src/features/booking-v2/types";

const quote = {
  authorityReceipt: "fresh.signed-receipt", distance_km: 6, base_fee: 450,
  price_per_km: 25, distance_charge: 150, logistics_fee: 600,
  base_location: "Synthetic base", manual_quote_required: false, manual_quote_message: "",
};
const values = () => ({
  address: "21 Synthetic Street, Unit 4", suburb: "Claremont", city: "Cape Town",
  postalCode: "7708", equipmentRequired: "yes", pendingBookingId: null,
  equipmentQuote: { ...quote, authorityReceipt: "expired.receipt" },
  quoteLock: { expiresAt: "2099-01-01T00:00:00Z" },
}) as BookingV2FormData;
beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SHALEAN_APP_ENV", "staging");
  vi.stubEnv("NEXT_PUBLIC_FCO_01_REGULAR_HOME_PREVIEW", "true");
});
afterEach(() => vi.unstubAllEnvs());

describe("FCO equipment renewal at first payment confirmation", () => {
  it("renews an old receipt with full delivery details even while the booking lock remains valid", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ quote }));
    const renewed = await renewFcoEquipmentForCheckout("regular-cleaning", values(), fetcher);
    expect(renewed?.authorityReceipt).toBe("fresh.signed-receipt");
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toBe("/api/booking-v2/equipment-quote");
    expect(fetcher.mock.calls[0][2]).toBe(30_000);
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({
      serviceSlug: "regular-cleaning", equipmentRequired: true,
      address: "21 Synthetic Street, Unit 4", suburb: "Claremont",
      city: "Cape Town", postalCode: "7708",
    });
  });

  it("preserves existing pending-payment recovery without requesting a fresh receipt", async () => {
    const fetcher = vi.fn();
    const result = await renewFcoEquipmentForCheckout("regular-cleaning",
      { ...values(), pendingBookingId: "existing-pending-booking" }, fetcher);
    expect(result).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("does not alter equipment-free, non-Regular, disabled or production journeys", async () => {
    const fetcher = vi.fn();
    expect(await renewFcoEquipmentForCheckout("regular-cleaning",
      { ...values(), equipmentRequired: "no" }, fetcher)).toBeNull();
    expect(await renewFcoEquipmentForCheckout("deep-cleaning", values(), fetcher)).toBeNull();
    vi.stubEnv("NEXT_PUBLIC_FCO_01_REGULAR_HOME_PREVIEW", "false");
    expect(await renewFcoEquipmentForCheckout("regular-cleaning", values(), fetcher)).toBeNull();
    vi.stubEnv("NEXT_PUBLIC_FCO_01_REGULAR_HOME_PREVIEW", "true");
    vi.stubEnv("NEXT_PUBLIC_SHALEAN_APP_ENV", "production");
    expect(await renewFcoEquipmentForCheckout("regular-cleaning", values(), fetcher)).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([
    { quote: null },
    { quote: { ...quote, authorityReceipt: "" } },
    { quote: { ...quote, manual_quote_required: true } },
    { quote: { ...quote, geocode_error: true } },
    { quote: { ...quote, logistics_fee: -1 } },
  ])("rejects unavailable or unresolved renewal rather than reusing old equipment pricing: %j", async (body) => {
    const fetcher = vi.fn().mockResolvedValue(Response.json(body));
    await expect(renewFcoEquipmentForCheckout("regular-cleaning", values(), fetcher)).rejects.toThrow();
  });

  it("can retry renewal after an unavailable provider response", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(Response.json({ error: "Temporarily unavailable" }, { status: 503 }))
      .mockResolvedValueOnce(Response.json({ quote }));
    await expect(renewFcoEquipmentForCheckout("regular-cleaning", values(), fetcher)).rejects.toThrow("Temporarily unavailable");
    expect((await renewFcoEquipmentForCheckout("regular-cleaning", values(), fetcher))?.authorityReceipt)
      .toBe("fresh.signed-receipt");
  });
});
