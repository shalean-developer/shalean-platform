import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SERVICE_CONFIG } from "@/src/features/booking-v2/config/serviceConfig";
import {
  bookingDetailsFinalStage,
  bookingDetailsShowsExtras,
  bookingDetailsStageFromSearchParam,
  bookingDetailsStageReady,
} from "@/src/features/booking-v2/steps/serviceProgressiveDisclosure";
import {
  recurringFrequenciesForService,
  recurringScheduleAllowedForService,
  serviceAllowsRecurringBookings,
} from "@/lib/booking-v2/serviceRecurringPolicy";
import { calculateCustomerTotal } from "@/lib/booking-v2/calculateCustomerTotal";
import { defaultBookingV2FeesConfig } from "@/lib/booking-v2/bookingV2FeesConfig";
import {
  informationalFieldKeys,
  pricingRelevantFieldKeys,
} from "@/lib/booking-v2/servicePricingContract";

const catalogSource = readFileSync(
  join(process.cwd(), "lib/booking-v2/loadBookingV2Catalog.ts"),
  "utf8",
);
const contextSource = readFileSync(
  join(process.cwd(), "src/features/booking-v2/BookingV2Context.tsx"),
  "utf8",
);
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
const summarySource = readFileSync(
  join(process.cwd(), "src/features/booking-v2/components/BookingV2SummaryPanel.tsx"),
  "utf8",
);
const seed = JSON.parse(
  readFileSync(
    join(process.cwd(), "../../supabase/seeds/booking_v2_catalog_config.json"),
    "utf8",
  ),
) as {
  services: Array<{
    slug: string;
    pricingSlug: string;
    showCleaningProductsQuestion?: boolean;
    showEquipmentQuestion?: boolean;
    extraSlugs?: string[];
    step1Questions: Array<{ key: string; label: string }>;
  }>;
};

describe("Office Booking V2 simplification", () => {
  it("keeps only canonical Office details questions", () => {
    const questions = SERVICE_CONFIG["office-cleaning"].step1Questions;
    expect(questions.map((question) => question.key)).toEqual([
      "officeSize",
      "bathrooms",
    ]);
    expect(questions.find((question) => question.key === "bathrooms")?.label).toBe(
      "Bathrooms",
    );
    expect(questions.some((question) => question.key === "afterHours")).toBe(false);
    expect(
      questions.some((question) => question.key === "specialInstructions"),
    ).toBe(false);
  });

  it("uses Office rooms as the final details/add-ons stage with no empty preferences page", () => {
    expect(bookingDetailsFinalStage("office-cleaning")).toBe("rooms");
    expect(bookingDetailsShowsExtras("office-cleaning", "rooms")).toBe(true);
    expect(bookingDetailsStageFromSearchParam("office-cleaning", "preferences")).toBeNull();
    expect(
      bookingDetailsStageReady(
        "office-cleaning",
        "rooms",
        {
          officeSize: "medium",
          bathrooms: "2",
        },
        {
          address: "12 Long Street",
          suburb: "Cape Town",
          contactPhone: "0821234567",
          serviceAreaLocationId: "13bb6c75-58a4-4a89-9416-bab320aa203b",
        },
        SERVICE_CONFIG["office-cleaning"].step1Questions,
      ),
    ).toBe(true);
  });

  it("keeps Office size and bathrooms as pricing inputs while recurrence stays in Schedule", () => {
    expect(pricingRelevantFieldKeys("office-cleaning")).toEqual([
      "officeSize",
      "bathrooms",
    ]);
    expect(informationalFieldKeys("office-cleaning")).toEqual([]);
    expect(serviceAllowsRecurringBookings("office-cleaning")).toBe(true);
    expect(recurringFrequenciesForService("office-cleaning")).toEqual([
      "weekly",
      "fortnightly",
      "monthly",
    ]);
    expect(
      recurringScheduleAllowedForService({
        serviceSlug: "office-cleaning",
        bookingType: "recurring",
        recurringFrequency: "custom",
        recurringDays: ["Monday"],
      }),
    ).toBe(false);
  });

  it("normalizes old Office catalog questions and hidden equipment state at runtime", () => {
    expect(catalogSource).toContain('serviceSlug === "office-cleaning"');
    expect(catalogSource).toContain("SERVICE_CONFIG[serviceSlug].step1Questions");
    expect(catalogSource).toContain(
      "showEquipmentQuestion: serviceRequiresCustomerEquipmentChoice(slug)",
    );
    expect(catalogSource).toContain(
      "showCleaningProductsQuestion: serviceRequiresCustomerEquipmentChoice(slug)",
    );
  });

  it("strips retired Office draft fields before confirmation", () => {
    expect(contextSource).toContain('delete serviceDetails.frequency;');
    expect(contextSource).toContain('delete serviceDetails.afterHours;');
    expect(contextSource).toContain('delete serviceDetails.specialInstructions;');
    expect(step1Source).toContain(
      '["officeType", "frequency", "afterHours", "specialInstructions"]',
    );
  });

  it("uses the Office pricing family and canonical Office scope in the seed", () => {
    const office = seed.services.find((service) => service.slug === "office-cleaning");
    expect(office).toBeDefined();
    expect(office?.pricingSlug).toBe("office");
    expect(office?.showCleaningProductsQuestion).toBe(false);
    expect(office?.showEquipmentQuestion).toBe(false);
    // The seed may retain legacy officeType; runtime canonicalization replaces it
    // with SERVICE_CONFIG before the customer sees the flow.
    expect(office?.step1Questions.map((question) => question.key)).toEqual([
      "officeType",
      "officeSize",
      "bathrooms",
    ]);
    expect(office?.extraSlugs).toEqual([
      "office-kitchen",
      "office-sanitisation",
      "waste-removal",
    ]);
  });

  it("presents consolidated Office details in Review and Summary", () => {
    expect(reviewSource).toContain('"Office details"');
    expect(summarySource).toContain('"Office scope"');
    expect(summarySource).toContain('values.serviceSlug === "office-cleaning"');
    expect(summarySource).toContain("detailsStageIndex >= finalDetailsStageIndex");
    expect(summarySource).not.toContain(
      'optionLabel("afterHours", values.serviceDetails.afterHours)',
    );
  });

  it("centres the three supported Office frequency cards horizontally", () => {
    expect(step2Source).toContain("recurringFrequencyOptions.length === 3");
    expect(step2Source).toContain('"max-w-3xl lg:grid-cols-3"');
    expect(step2Source).toContain('"max-w-5xl lg:grid-cols-4"');
  });

  it("uses the current wall-clock quote duration for Office availability", () => {
    expect(step2Source).toContain("pricingSummary?.team_scaled_duration_minutes");
    expect(step2Source).toContain("pricingSummary?.estimated_duration_minutes");
    expect(reviewSource).toContain("pricingSummary?.team_scaled_duration_minutes");
    expect(reviewSource).toContain("pricingSummary?.estimated_duration_minutes");
  });

  it("returns Office Review edits to canonical Details/Schedule stages and hides empty add-ons", () => {
    expect(reviewSource).toContain('function editOfficeDetails()');
    expect(reviewSource).toContain('editDetailsSection("rooms")');
    expect(reviewSource).toContain('function editOfficeSchedule()');
    expect(reviewSource).toContain('editScheduleSection("booking_type")');
    expect(reviewSource).toContain('function editOfficeCleaner()');
    expect(reviewSource).toContain('editScheduleSection("cleaner")');
    expect(reviewSource).toContain("const showAddonsReview = extrasSource.length > 0 || selectedExtras.length > 0");
  });

  it("invalidates Office schedule/cleaner selections when duration-driving scope changes", () => {
    expect(contextSource).toContain("const prevOfficeScopeRef");
    expect(contextSource).toContain('info.name !== "serviceDetails.officeSize"');
    expect(contextSource).toContain('info.name !== "serviceDetails.bathrooms"');
    expect(contextSource).toContain('form.setValue("time", ""');
    expect(contextSource).toContain('form.setValue("selectedCleanerIds", []');
  });

  it("revalidates Office Details and Schedule before entering Payment", () => {
    expect(contextSource).toContain('if (serviceSlug === "office-cleaning")');
    expect(contextSource).toContain('bookingDetailsStageReady(');
    expect(contextSource).toContain('buildStep2Schema(scheduling).safeParse(values)');
    expect(contextSource).toContain('params.set("step", "details")');
    expect(contextSource).toContain('params.set("step", "schedule")');
  });

  it("derives Medium + 2 bathroom Office duration from database-style coefficients", () => {
    const quote = calculateCustomerTotal({
      serviceSlug: "office-cleaning",
      serviceLabel: "Office Cleaning",
      serviceDetails: {
        officeSize: "medium",
        bathrooms: "2",
      },
      selectedExtras: [],
      cleanerMode: "individual_cleaners",
      cleanerCount: 1,
      bookingType: "once_off",
      recurringFrequency: "",
      catalog: {
        basePrice: 300,
        pricePerBedroom: 0,
        pricePerBathroom: 50,
        pricePerExtraRoom: 0,
        pricePerExtraCleaner: 100,
        serviceFeeZar: 40,
        estimatedDurationHours: 3.5,
        durationBaseHours: 3.5,
        durationPerBedroomHours: 0.5,
        durationPerBathroomHours: 0.5,
        durationPerExtraRoomHours: 0.3,
        minDurationHours: 2,
        maxDurationHours: 8,
        extras: [],
        allowsExtraCleaner: true,
        showEquipmentQuestion: false,
      },
      feesConfig: defaultBookingV2FeesConfig(),
    });

    expect(quote.estimated_duration_minutes).toBe(330);
  });
});
