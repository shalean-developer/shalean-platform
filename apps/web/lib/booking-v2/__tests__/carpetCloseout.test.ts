import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { calculateCustomerTotal } from "@/lib/booking-v2/calculateCustomerTotal";
import { defaultBookingV2FeesConfig } from "@/lib/booking-v2/bookingV2FeesConfig";
import {
  SERVICE_PRICING_CONTRACTS,
  informationalFieldKeys,
  pricingRelevantFieldKeys,
} from "@/lib/booking-v2/servicePricingContract";
import { bookingV2ConfirmSchema } from "@/src/features/booking-v2/schemas";
import {
  roomCountCustomMinimum,
  roomCountToChip,
} from "@/src/features/booking-v2/config/roomCountOptions";
import { SERVICE_CONFIG } from "@/src/features/booking-v2/config/serviceConfig";
import { canonicalCarpetCount } from "@/lib/booking-v2/carpetCountValidation";

const step1Source = readFileSync(
  join(process.cwd(), "src/features/booking-v2/steps/Step1Details.tsx"),
  "utf8",
);
const step2Source = readFileSync(
  join(process.cwd(), "src/features/booking-v2/steps/Step2Schedule.tsx"),
  "utf8",
);
const reviewSource = readFileSync(
  join(process.cwd(), "src/features/booking-v2/steps/Step3Review.tsx"),
  "utf8",
);
const contextSource = readFileSync(
  join(process.cwd(), "src/features/booking-v2/BookingV2Context.tsx"),
  "utf8",
);
const quoteRouteSource = readFileSync(
  join(process.cwd(), "app/api/booking-v2/quote/route.ts"),
  "utf8",
);

function confirmPayload(overrides: Record<string, unknown> = {}) {
  return {
    serviceSlug: "carpet-cleaning",
    serviceDetails: {
      propertyType: "house",
      carpetRooms: "10",
      rugCount: "8",
      carpetType: "standard",
      stains: "no",
    },
    address: "20 Warbreck Road",
    suburb: "Athlone",
    contactPhone: "+27825915525",
    selectedExtras: [],
    equipmentRequired: "no",
    equipmentQuote: null,
    bookingType: "once_off",
    date: "2026-09-30",
    time: "08:00",
    cleanerMode: "individual_cleaners",
    cleanerCount: 1,
    selectedCleanerIds: [],
    pricingSummary: { total: 3190, estimated_total: 3190 },
    ...overrides,
  };
}

describe("Carpet Booking V2 closeout", () => {
  it("uses exact custom counts instead of pricing capped 6+ rooms / 4+ rugs", () => {
    expect(roomCountCustomMinimum("carpetRooms")).toBe(6);
    expect(roomCountCustomMinimum("rugCount")).toBe(4);
    expect(roomCountToChip("10", "carpetRooms")).toBe("6+");
    expect(roomCountToChip("8", "rugCount")).toBe("4+");
    expect(step1Source).toContain('question.key === "carpetRooms"');
    expect(step1Source).toContain('question.key === "rugCount"');

    const carpetRooms = SERVICE_CONFIG["carpet-cleaning"].step1Questions.find(
      (question) => question.key === "carpetRooms",
    );
    const rugs = SERVICE_CONFIG["carpet-cleaning"].step1Questions.find(
      (question) => question.key === "rugCount",
    );
    expect(carpetRooms?.options?.at(-1)).toEqual({ value: "6+", label: "6+ Custom" });
    expect(rugs?.options?.at(-1)).toEqual({ value: "4+", label: "4+ Custom" });
  });

  it("prices and times the exact Carpet quantities without truncating them", () => {
    const fees = defaultBookingV2FeesConfig();
    fees.propertyFactorRates.carpetRooms_per_room_zar = 0;
    fees.propertyFactorRates.rugs_per_unit_zar = 180;

    const quote = calculateCustomerTotal({
      serviceSlug: "carpet-cleaning",
      serviceLabel: "Carpet Cleaning",
      serviceDetails: {
        propertyType: "house",
        carpetRooms: "10",
        rugCount: "8",
        carpetType: "standard",
        stains: "no",
      },
      selectedExtras: [],
      cleanerMode: "individual_cleaners",
      cleanerCount: 1,
      bookingType: "once_off",
      recurringFrequency: "",
      catalog: {
        basePrice: 500,
        pricePerBedroom: 120,
        pricePerBathroom: 0,
        pricePerExtraRoom: 30,
        pricePerExtraCleaner: 0,
        serviceFeeZar: 50,
        estimatedDurationHours: 4,
        durationBaseHours: 3.5,
        durationPerBedroomHours: 0.5,
        durationPerBathroomHours: 0.5,
        durationPerExtraRoomHours: 0.3,
        minDurationHours: 2,
        maxDurationHours: 8,
        extras: [],
        allowsExtraCleaner: false,
        showEquipmentQuestion: false,
      },
      feesConfig: fees,
    });

    expect(quote.property_size_price).toBe(2640);
    expect(quote.service_fee).toBe(50);
    expect(quote.estimated_total).toBe(3190);
    expect(quote.estimated_duration_minutes).toBe(480);
  });

  it("classifies Carpet inputs according to what the engines really do", () => {
    expect(informationalFieldKeys("carpet-cleaning")).toContain("propertyType");
    expect(pricingRelevantFieldKeys("carpet-cleaning")).toEqual([
      "carpetRooms",
      "rugCount",
      "carpetType",
      "stains",
    ]);
    const fields = SERVICE_PRICING_CONTRACTS["carpet-cleaning"].fields;
    expect(fields.find((field) => field.key === "carpetType")?.effect).toBe("price_only");
    expect(fields.find((field) => field.key === "stains")?.effect).toBe("price_only");
  });

  it("keeps Carpet extras database-authoritative and removes inaccurate duration copy", () => {
    expect(SERVICE_CONFIG["carpet-cleaning"].extras).toEqual([]);
    expect(step2Source).not.toContain("Allow 2–4 hours");
    expect(step2Source).toContain("we'll calculate the cleaning time from your carpeted rooms and rugs");
  });

  it("routes Carpet Review edits back to canonical Details and Schedule flows", () => {
    expect(reviewSource).toContain("function editCarpetDetails()");
    expect(reviewSource).toContain('editDetailsSection("rooms")');
    expect(reviewSource).toContain("function editCarpetSchedule()");
    expect(reviewSource).toContain('editScheduleSection("date_time")');
    expect(reviewSource).toContain("function editCarpetCleaner()");
    expect(reviewSource).toContain('editScheduleSection("cleaner")');
    expect(reviewSource).toContain("function editCarpetAddons()");
    expect(reviewSource).toContain('editDetailsSection("condition")');
  });

  it("invalidates stale Carpet time/specialist when duration-driving scope changes", () => {
    expect(contextSource).toContain("const prevCarpetScopeRef");
    expect(contextSource).toContain('info.name !== "serviceDetails.carpetRooms"');
    expect(contextSource).toContain('info.name !== "serviceDetails.rugCount"');
    expect(contextSource).toContain('info.name !== "selectedExtras"');
    expect(contextSource).toContain('form.setValue("time", ""');
    expect(contextSource).toContain('form.setValue("selectedCleanerIds", []');
  });

  it("revalidates Carpet Details and Schedule before Payment", () => {
    expect(contextSource).toContain('if (serviceSlug === "carpet-cleaning")');
    expect(contextSource).toContain('const stages = ["property", "rooms", "condition"] as const');
    expect(contextSource).toContain("buildStep2Schema(scheduling).safeParse(values)");
  });

  it("uses one canonical decimal-count parser at quote and confirm boundaries", () => {
    expect(canonicalCarpetCount("10", { min: 1, max: 25 })).toBe(10);
    expect(canonicalCarpetCount(10, { min: 1, max: 25 })).toBe(10);
    expect(canonicalCarpetCount("0", { min: 0, max: 25 })).toBe(0);
    expect(canonicalCarpetCount("1e1", { min: 0, max: 25 })).toBeNull();
    expect(canonicalCarpetCount("0x10", { min: 0, max: 25 })).toBeNull();
    expect(canonicalCarpetCount("06", { min: 1, max: 25 })).toBeNull();
    expect(canonicalCarpetCount("6+", { min: 1, max: 25 })).toBeNull();
    expect(canonicalCarpetCount(1.5, { min: 1, max: 25 })).toBeNull();

    expect(quoteRouteSource).toContain('canonicalCarpetCount(rooms, { min: 1, max: 25 })');
    expect(quoteRouteSource).toContain('canonicalCarpetCount(rugs, { min: 0, max: 25 })');
  });

  it("server confirm rejects incomplete or capped pseudo-count Carpet payloads", () => {
    expect(bookingV2ConfirmSchema.safeParse(confirmPayload()).success).toBe(true);

    expect(
      bookingV2ConfirmSchema.safeParse(
        confirmPayload({
          serviceDetails: {
            propertyType: "house",
            carpetRooms: "6+",
            rugCount: "4+",
            carpetType: "standard",
            stains: "no",
          },
        }),
      ).success,
    ).toBe(false);

    expect(
      bookingV2ConfirmSchema.safeParse(
        confirmPayload({
          serviceDetails: {
            propertyType: "house",
            carpetRooms: "2",
            rugCount: "0",
            carpetType: "standard",
          },
        }),
      ).success,
    ).toBe(false);

    for (const serviceDetails of [
      {
        propertyType: "house",
        carpetRooms: "0x10",
        rugCount: "0",
        carpetType: "standard",
        stains: "no",
      },
      {
        propertyType: "house",
        carpetRooms: "2",
        rugCount: "1e1",
        carpetType: "standard",
        stains: "no",
      },
    ]) {
      expect(
        bookingV2ConfirmSchema.safeParse(confirmPayload({ serviceDetails })).success,
      ).toBe(false);
    }
  });
});
