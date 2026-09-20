import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { calculateCustomerTotal } from "@/lib/booking-v2/calculateCustomerTotal";
import { defaultBookingV2FeesConfig } from "@/lib/booking-v2/bookingV2FeesConfig";
import {
  recurringScheduleAllowedForService,
  serviceAllowsRecurringBookings,
} from "@/lib/booking-v2/serviceRecurringPolicy";
import { SERVICE_EXTRA_SLUGS } from "@/lib/booking-v2/serviceExtraSlugs";
import { SERVICE_CONFIG } from "@/src/features/booking-v2/config/serviceConfig";
import { EXTRA_CLEANER_SERVICE_SLUGS } from "@shalean/pricing";

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
const catalogSource = readFileSync(
  join(process.cwd(), "lib/booking-v2/loadBookingV2Catalog.ts"),
  "utf8",
);
const schemaSource = readFileSync(
  join(process.cwd(), "src/features/booking-v2/schemas.ts"),
  "utf8",
);
const catalogSeed = JSON.parse(
  readFileSync(
    join(process.cwd(), "../../supabase/seeds/booking_v2_catalog_config.json"),
    "utf8",
  ),
) as {
  services: Array<{
    slug: string;
    step1Questions: Array<{ key: string }>;
    extraSlugs?: string[];
    allowsExtraCleaner?: boolean;
  }>;
};

describe("Carpet Cleaning simplified Step 1 to Step 4 journey", () => {
  it("Step 1 contains only the canonical Carpet intake questions", () => {
    const keys = SERVICE_CONFIG["carpet-cleaning"].step1Questions.map(
      (question) => question.key,
    );
    expect(keys).toEqual([
      "propertyType",
      "carpetRooms",
      "rugCount",
      "carpetType",
      "stains",
    ]);
    expect(keys).not.toContain("sofaCount");
    expect(keys).not.toContain("hasPets");
    expect(keys).not.toContain("specialInstructions");

    const seeded = catalogSeed.services.find(
      (service) => service.slug === "carpet-cleaning",
    );
    expect(seeded?.step1Questions.map((question) => question.key)).toEqual(keys);
  });

  it("Step 1 keeps useful add-ons but removes the duplicate Stain treatment add-on", () => {
    expect(SERVICE_EXTRA_SLUGS["carpet-cleaning"]).toEqual([
      "sofa-upholstery",
      "pet-odour-treatment",
      "fabric-protector",
      "mattress-cleaning",
    ]);
    expect(SERVICE_EXTRA_SLUGS["carpet-cleaning"]).not.toContain(
      "stain-treatment",
    );
    expect(catalogSource).toContain(
      'serviceSlug === "carpet-cleaning" && slug === "stain-treatment"',
    );
  });

  it("prices visible stains once through the Carpet condition factor", () => {
    const feesConfig = defaultBookingV2FeesConfig();
    const breakdown = calculateCustomerTotal({
      serviceSlug: "carpet-cleaning",
      serviceLabel: "Carpet Cleaning",
      serviceDetails: {
        propertyType: "house",
        carpetRooms: "1",
        rugCount: "0",
        carpetType: "standard",
        stains: "yes",
      },
      selectedExtras: [],
      cleanerMode: "individual_cleaners",
      cleanerCount: 1,
      bookingType: "once_off",
      recurringFrequency: "",
      catalog: {
        basePrice: 500,
        pricePerBedroom: 200,
        pricePerBathroom: 0,
        pricePerExtraRoom: 0,
        pricePerExtraCleaner: 0,
        serviceFeeZar: 50,
        estimatedDurationHours: 4,
        minDurationHours: 2,
        maxDurationHours: 10,
        extras: [],
        allowsExtraCleaner: false,
        showEquipmentQuestion: false,
      },
      feesConfig,
      vipTier: null,
    });

    const stainLines = (breakdown.factorLines ?? []).filter(
      (line) => line.key === "stains",
    );
    expect(stainLines).toHaveLength(1);
    expect(stainLines[0]?.label).toBe("Stain treatment");
    expect(stainLines[0]?.amountZar).toBe(
      feesConfig.propertyFactorRates.stains?.yes,
    );
    expect(breakdown.selected_extras).toEqual([]);
  });

  it("Step 2 is once-off only and fixed to one specialist", () => {
    expect(serviceAllowsRecurringBookings("carpet-cleaning")).toBe(false);
    expect(
      recurringScheduleAllowedForService({
        serviceSlug: "carpet-cleaning",
        bookingType: "recurring",
        recurringFrequency: "monthly",
        recurringDays: [],
      }),
    ).toBe(false);
    expect(EXTRA_CLEANER_SERVICE_SLUGS.has("carpet-cleaning")).toBe(false);
    expect(contextSource).toContain("const normalizedMerged = sanitizeStoredForm(");
    expect(contextSource).toContain('extraId !== "stain-treatment"');

    expect(contextSource).toContain(
      'serviceSlug === "carpet-cleaning"\n          ? "date_time"',
    );
    expect(step2Source).toContain(
      'const isCarpetCleaning = serviceSlug === "carpet-cleaning";',
    );
    expect(step2Source).toContain(
      'maxSelect={isCarpetCleaning ? 1 : cleanerCount}',
    );
    expect(step2Source).toContain(
      'heading={isCarpetCleaning ? "Choose your specialist" : undefined}',
    );
  });

  it("Step 3 separates Carpet scope and Condition and uses Specialist presentation", () => {
    expect(reviewSource).toContain('title="Carpet scope"');
    expect(reviewSource).toContain('title="Condition"');
    expect(reviewSource).toContain(
      'title={isCarpetCleaning ? "Specialist" : "Cleaner preference"}',
    );
    expect(reviewSource).toContain(
      'values.cleanerMode === "individual_cleaners" && !isCarpetCleaning',
    );
    expect(reviewSource).toContain("{!isCarpetCleaning ? (");
  });

  it("Step 4 enforces the Carpet once-off and one-specialist contract", () => {
    expect(schemaSource).toContain(
      '"Carpet Cleaning is available as a once-off booking only."',
    );
    expect(schemaSource).toContain(
      '"Carpet Cleaning uses one specialist per booking."',
    );
    expect(schemaSource).toContain(
      '"Choose at most one preferred Carpet Cleaning specialist."',
    );
  });

  it("runtime catalog ignores retired Carpet database questions and extra-cleaner policy", () => {
    expect(catalogSource).toContain(
      'SERVICE_CONFIG["carpet-cleaning"].step1Questions',
    );
    expect(catalogSource).toContain(
      'slug === "carpet-cleaning" ? false : serviceDef.allowsExtraCleaner',
    );

    const seeded = catalogSeed.services.find(
      (service) => service.slug === "carpet-cleaning",
    );
    expect(seeded?.allowsExtraCleaner).toBe(false);
    expect(seeded?.extraSlugs).not.toContain("stain-treatment");
  });
});
