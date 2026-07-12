import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildConfirmPayload } from "../buildConfirmPayload";
import { defaultBookingFormData } from "../defaultForm";
import { bookingV2ConfirmSchema } from "../schemas";

const baseForm = (() => {
  const form = defaultBookingFormData("regular-cleaning");
  return {
    ...form,
    serviceDetails: { bedrooms: "2", bathrooms: "1", extraRooms: "0", propertyType: "house" },
    address: "12 Ocean View Drive",
    suburb: "Claremont",
    serviceAreaLocationId: "00000000-0000-4000-8000-000000000010",
    serviceAreaCityId: "00000000-0000-4000-8000-000000000020",
    city: "Cape Town",
    postalCode: "7708",
    contactPhone: "0821234567",
    equipmentRequired: "no" as const,
    equipmentQuote: null,
    bookingType: "once_off" as const,
    date: "2026-08-15",
    time: "09:00",
    cleanerMode: "individual_cleaners" as const,
    cleanerCount: 1,
    selectedCleanerIds: [],
    pricingSummary: {
      ...form.pricingSummary,
      total: 574,
      estimated_total: 574,
      basePrice: 450,
      base_service_price: 450,
    },
  };
})();

describe("buildConfirmPayload contract", () => {
  it("matches web confirm basePayload required keys and parses with zod", () => {
    const payload = buildConfirmPayload(baseForm);

    assert.equal(payload.serviceSlug, "regular-cleaning");
    assert.equal(payload.address, "12 Ocean View Drive");
    assert.equal(payload.suburb, "Claremont");
    assert.equal(payload.contactPhone, "0821234567");
    assert.equal(payload.bookingType, "once_off");
    assert.equal(payload.date, "2026-08-15");
    assert.equal(payload.time, "09:00");
    assert.equal(payload.cleanerMode, "individual_cleaners");
    assert.equal(payload.equipmentRequired, "no");
    assert.equal(payload.pricingSummary.total, 574);
    assert.equal(payload.pricingSummary.estimated_total, 574);

    const requiredKeys = [
      "serviceSlug",
      "serviceDetails",
      "address",
      "suburb",
      "serviceAreaLocationId",
      "serviceAreaCityId",
      "city",
      "postalCode",
      "contactPhone",
      "selectedExtras",
      "equipmentRequired",
      "bookingType",
      "date",
      "time",
      "cleanerMode",
      "cleanerCount",
      "pricingSummary",
    ] as const;

    for (const key of requiredKeys) {
      assert.ok(key in payload, `missing key ${key}`);
    }

    const parsed = bookingV2ConfirmSchema.safeParse(payload);
    assert.equal(parsed.success, true, parsed.success ? "" : JSON.stringify(parsed.error.format()));
  });

  it("normalizes boolean serviceDetails to yes/no", () => {
    const payload = buildConfirmPayload({
      ...baseForm,
      serviceDetails: { ...baseForm.serviceDetails, pets: true, balcony: false },
    });
    assert.equal(payload.serviceDetails.pets, "yes");
    assert.equal(payload.serviceDetails.balcony, "no");
  });

  it("includes optional promo, referral, and credit fields when provided", () => {
    const payload = buildConfirmPayload(baseForm, {
      applyCleaningCreditZar: 50,
      referralCode: "FRIEND10",
      promoCode: "WELCOME",
    });
    assert.equal(payload.applyCleaningCreditZar, 50);
    assert.equal(payload.referralCode, "FRIEND10");
    assert.equal(payload.promoCode, "WELCOME");
  });
});
