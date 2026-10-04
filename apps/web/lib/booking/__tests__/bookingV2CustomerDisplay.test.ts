import { describe, expect, it } from "vitest";
import {
  cleanDetailLinesFromServiceDetails,
  extrasLinesFromBookingRow,
  priceLinesFromPricingSummary,
  roomsLinesFromServiceDetails,
  serviceLabelFromBookingRow,
} from "@/lib/booking/bookingV2CustomerDisplay";

describe("bookingV2CustomerDisplay", () => {
  it("maps service slug to label", () => {
    expect(serviceLabelFromBookingRow({ service: null, service_slug: "regular-cleaning" })).toBe("Regular Cleaning");
    expect(serviceLabelFromBookingRow({ service: "regular-cleaning", service_slug: "regular-cleaning" })).toBe(
      "Regular Cleaning",
    );
    expect(serviceLabelFromBookingRow({ service: "regular-cleaning", service_slug: null })).toBe("Regular Cleaning");
    expect(serviceLabelFromBookingRow({ service: "Standard Cleaning", service_slug: null })).toBe("Standard Cleaning");
  });

  it("normalizes legacy catalog slugs to catalog labels", () => {
    expect(serviceLabelFromBookingRow({ service: "Standard", service_slug: "standard" })).toBe("Standard Cleaning");
    expect(serviceLabelFromBookingRow({ service: "Standard", service_slug: null })).toBe("Standard Cleaning");
    expect(serviceLabelFromBookingRow({ service: null, service_slug: "deep" })).toBe("Deep Cleaning");
  });

  it("reads rooms from service_details strings", () => {
    expect(
      roomsLinesFromServiceDetails({
        bedrooms: "3",
        bathrooms: "2",
        extraRooms: "0",
      }),
    ).toEqual(["3 bedrooms", "2 bathrooms"]);
  });

  it("reads extras from pricing_summary line items", () => {
    expect(
      extrasLinesFromBookingRow({
        extras: [],
        selected_extras: ["inside_oven"],
        pricing_summary: {
          lineItems: [
            { label: "Regular Cleaning (base)", amountZar: 250 },
            { label: "3 bedrooms", amountZar: 90 },
            { label: "Inside Oven", amountZar: 200 },
          ],
        },
      }),
    ).toEqual(["Inside Oven · R 200"]);
  });

  it("formats non-room service details", () => {
    expect(
      cleanDetailLinesFromServiceDetails({
        bedrooms: "3",
        propertyType: "house",
        hasPets: "yes",
        specialInstructions: "Focus on kitchen",
      }),
    ).toEqual([
      { label: "Property type", value: "House" },
      { label: "Pets on site", value: "Yes" },
      { label: "Special instructions", value: "Focus on kitchen" },
    ]);
  });

  it("formats the selected pet category", () => {
    expect(cleanDetailLinesFromServiceDetails({ hasPets: "dogs_and_cats" })).toEqual([
      { label: "Pets on site", value: "Dogs & Cats" },
    ]);
  });


  it("formats Carpet details with customer-facing labels and values", () => {
    expect(
      cleanDetailLinesFromServiceDetails({
        stains: "no",
        rugCount: "1",
        carpetType: "thick_pile",
        carpetRooms: "3",
        propertyType: "apartment",
      }),
    ).toEqual([
      { label: "Visible stains", value: "No" },
      { label: "Rugs", value: "1" },
      { label: "Carpet type", value: "Thick Pile" },
      { label: "Carpeted rooms", value: "3" },
      { label: "Property type", value: "Apartment / flat" },
    ]);
  });


  it("formats Airbnb details with cleaner-friendly labels and values", () => {
    expect(
      cleanDetailLinesFromServiceDetails({
        linens: "change",
        keyAccess: "smart_lock",
        propertyType: "townhouse",
      }),
    ).toEqual([
      { label: "Linen service", value: "Change linens" },
      { label: "Key access", value: "Smart lock" },
      { label: "Property type", value: "Townhouse" },
    ]);
  });

  it("builds price lines from pricing_summary", () => {
    expect(
      priceLinesFromPricingSummary({
        lineItems: [
          { label: "Regular Cleaning (base)", amountZar: 250 },
          { label: "Inside Fridge", amountZar: 150 },
        ],
      }),
    ).toEqual([
      { kind: "job_combined", label: "Regular Cleaning (base)", amountZar: 250 },
      { kind: "job_combined", label: "Inside Fridge", amountZar: 150 },
    ]);
  });
});
