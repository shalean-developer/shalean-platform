import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { canonicalBookingCount } from "@/lib/booking-v2/carpetCountValidation";
import {
  informationalFieldKeys,
  pricingRelevantFieldKeys,
} from "@/lib/booking-v2/servicePricingContract";
import {
  bookingDetailsStageReady,
} from "@/src/features/booking-v2/steps/serviceProgressiveDisclosure";
import { bookingV2ConfirmSchema } from "@/src/features/booking-v2/schemas";
import { SERVICE_CONFIG } from "@/src/features/booking-v2/config/serviceConfig";

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
const quoteIntegritySource = readFileSync(
  join(process.cwd(), "lib/booking-v2/assertQuotePricingInputsConsumed.ts"),
  "utf8",
);

const address = {
  address: "12 Ocean View Drive",
  suburb: "Claremont",
  contactPhone: "+27820000000",
  serviceAreaLocationId: "13bb6c75-58a4-4a89-9416-bab320aa203b",
  gateCode: "",
  accessInstructions: "",
};

function confirmPayload(overrides: Record<string, unknown> = {}) {
  return {
    serviceSlug: "airbnb-cleaning",
    serviceDetails: {
      propertyType: "apartment",
      bedrooms: "1",
      bathrooms: "1",
      extraRooms: "0",
      linens: "change",
      keyAccess: "managed",
    },
    address: "12 Ocean View Drive",
    suburb: "Claremont",
    serviceAreaLocationId: "13bb6c75-58a4-4a89-9416-bab320aa203b",
    city: "Cape Town",
    contactPhone: "+27820000000",
    selectedExtras: [],
    equipmentRequired: "no",
    equipmentQuote: null,
    bookingType: "once_off",
    date: "2026-10-01",
    time: "08:00",
    cleanerMode: "individual_cleaners",
    cleanerCount: 1,
    selectedCleanerIds: [],
    pricingSummary: { total: 420, estimated_total: 420 },
    ...overrides,
  };
}

describe("Airbnb Booking V2 closeout", () => {
  it("keeps extra rooms optional and defaults it to zero in the customer flow", () => {
    const questions = SERVICE_CONFIG["airbnb-cleaning"].step1Questions;
    expect(questions.find((question) => question.key === "extraRooms")?.required).toBe(false);
    expect(step1Source).toContain('setValue("serviceDetails.extraRooms", "0"');

    expect(
      bookingDetailsStageReady(
        "airbnb-cleaning",
        "rooms",
        { bedrooms: "1", bathrooms: "1" },
        address,
        questions,
      ),
    ).toBe(true);
  });

  it("requires an access code for lockbox and smart-lock turnover methods", () => {
    const questions = SERVICE_CONFIG["airbnb-cleaning"].step1Questions;
    expect(
      bookingDetailsStageReady(
        "airbnb-cleaning",
        "turnover",
        { linens: "change", keyAccess: "lockbox" },
        address,
        questions,
      ),
    ).toBe(false);
    expect(
      bookingDetailsStageReady(
        "airbnb-cleaning",
        "turnover",
        { linens: "change", keyAccess: "lockbox" },
        { ...address, gateCode: "4821" },
        questions,
      ),
    ).toBe(true);
    expect(step1Source).toContain('id="airbnb-access-code"');
    expect(step1Source).toContain('register("accessInstructions")');
  });

  it("keeps Airbnb pricing on rooms while property/access choices stay informational", () => {
    expect(pricingRelevantFieldKeys("airbnb-cleaning")).toEqual([
      "bedrooms",
      "bathrooms",
      "extraRooms",
    ]);
    expect(informationalFieldKeys("airbnb-cleaning")).toEqual([
      "propertyType",
      "linens",
      "keyAccess",
    ]);
  });

  it("keeps Airbnb extras database-authoritative across drafts and asynchronous rebooks", () => {
    expect(SERVICE_CONFIG["airbnb-cleaning"].extras).toEqual([]);
    expect(contextSource).toContain("Reconcile old Airbnb drafts against the current authoritative extras catalog");
    expect(contextSource).toContain('form.setValue("selectedExtras", pruned');
    expect(contextSource).toContain('if (serviceSlug === "airbnb-cleaning" && liveConfig)');
    expect(contextSource).toContain("normalizedPatch.selectedExtras = (normalizedPatch.selectedExtras ?? []).filter");
  });

  it("invalidates stale Airbnb slot and cleaner choices when scope changes", () => {
    expect(contextSource).toContain("const prevAirbnbScopeRef");
    expect(contextSource).toContain('info.name !== "serviceDetails.bedrooms"');
    expect(contextSource).toContain('info.name !== "serviceDetails.bathrooms"');
    expect(contextSource).toContain('info.name !== "serviceDetails.extraRooms"');
    expect(contextSource).toContain('info.name !== "selectedExtras"');
    expect(contextSource).toContain('form.setValue("time", ""');
    expect(contextSource).toContain('form.setValue("selectedCleanerIds", []');
    expect(contextSource).toContain('setScheduleSectionOverride("date_time")');
  });

  it("uses the canonical Step 1/2 flows for Airbnb Review edits", () => {
    expect(reviewSource).toContain("function editAirbnbDetails()");
    expect(reviewSource).toContain('editDetailsSection("property")');
    expect(reviewSource).toContain("function editAirbnbSchedule()");
    expect(reviewSource).toContain('editScheduleSection("date_time")');
    expect(reviewSource).toContain("function editAirbnbCleaner()");
    expect(reviewSource).toContain('editScheduleSection("cleaner")');
    expect(reviewSource).toContain("function editAirbnbAddons()");
    expect(reviewSource).toContain('editDetailsSection("turnover")');
  });

  it("rechecks the live Airbnb slot and preferred cleaners before Payment", () => {
    expect(contextSource).toContain("verifySelectedBookingV2Slot");
    expect(contextSource).toContain("verifySelectedBookingV2Cleaners");
    expect(contextSource).toContain("Reconfirm an available turnover time before payment.");
  });

  it("shows the live extra-cleaner surcharge and avoids unsupported guest-arrival promises", () => {
    expect(step2Source).toContain("extraCleanerSurchargeZar");
    expect(step2Source).toContain("Add another cleaner (+R");
    expect(step2Source).toContain("Choose the turnover date and cleaning start time.");
    expect(step2Source).not.toContain("before your next guest arrives");
  });

  it("uses canonical decimal room counts at quote and confirm boundaries", () => {
    expect(canonicalBookingCount("0", { min: 0, max: 25 })).toBe(0);
    expect(canonicalBookingCount("12", { min: 0, max: 25 })).toBe(12);
    expect(canonicalBookingCount("1e1", { min: 0, max: 25 })).toBeNull();
    expect(canonicalBookingCount("0x10", { min: 0, max: 25 })).toBeNull();
    expect(canonicalBookingCount("06", { min: 0, max: 25 })).toBeNull();
    expect(canonicalBookingCount(1.5, { min: 0, max: 25 })).toBeNull();

    expect(quoteRouteSource).toContain('canonicalBookingCount(value, { min, max: 25 })');
    expect(quoteIntegritySource).toContain('? ["bedrooms", "bathrooms"]');
  });

  it("accepts the complete Airbnb server contract and rejects malformed/incomplete variants", () => {
    expect(bookingV2ConfirmSchema.safeParse(confirmPayload()).success).toBe(true);

    expect(
      bookingV2ConfirmSchema.safeParse(
        confirmPayload({
          serviceDetails: {
            propertyType: "apartment",
            bedrooms: "1",
            bathrooms: "1",
            linens: "change",
            keyAccess: "managed",
          },
        }),
      ).success,
    ).toBe(true);

    for (const serviceDetails of [
      {
        propertyType: "apartment",
        bedrooms: "1e1",
        bathrooms: "1",
        extraRooms: "0",
        linens: "change",
        keyAccess: "managed",
      },
      {
        propertyType: "apartment",
        bedrooms: "1",
        bathrooms: "0x10",
        extraRooms: "0",
        linens: "change",
        keyAccess: "managed",
      },
      {
        propertyType: "apartment",
        bedrooms: "1",
        bathrooms: "1",
        extraRooms: "0",
        linens: "",
        keyAccess: "managed",
      },
    ]) {
      expect(
        bookingV2ConfirmSchema.safeParse(confirmPayload({ serviceDetails })).success,
      ).toBe(false);
    }

    expect(
      bookingV2ConfirmSchema.safeParse(
        confirmPayload({
          serviceDetails: {
            propertyType: "apartment",
            bedrooms: "1",
            bathrooms: "1",
            extraRooms: "0",
            linens: "change",
            keyAccess: "lockbox",
          },
          gateCode: "",
        }),
      ).success,
    ).toBe(false);

    expect(
      bookingV2ConfirmSchema.safeParse(
        confirmPayload({
          cleanerCount: 1,
          selectedCleanerIds: ["cleaner-a", "cleaner-b"],
        }),
      ).success,
    ).toBe(false);
  });
});
