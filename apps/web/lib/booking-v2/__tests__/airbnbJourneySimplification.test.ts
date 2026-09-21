import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SERVICE_CONFIG } from "@/src/features/booking-v2/config/serviceConfig";
import {
  informationalFieldKeys,
  pricingRelevantFieldKeys,
} from "@/lib/booking-v2/servicePricingContract";
import {
  recurringScheduleAllowedForService,
  serviceAllowsRecurringBookings,
} from "@/lib/booking-v2/serviceRecurringPolicy";
import {
  serviceIncludesShaleanSupplies,
  serviceRequiresCustomerEquipmentChoice,
} from "@/lib/booking-v2/serviceSuppliesPolicy";
import { bookingDetailsStageReady } from "@/src/features/booking-v2/steps/serviceProgressiveDisclosure";

const contextSource = readFileSync(
  join(process.cwd(), "src/features/booking-v2/BookingV2Context.tsx"),
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
const catalogSource = readFileSync(
  join(process.cwd(), "lib/booking-v2/loadBookingV2Catalog.ts"),
  "utf8",
);
const schemaSource = readFileSync(
  join(process.cwd(), "src/features/booking-v2/schemas.ts"),
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
    showCleaningProductsQuestion?: boolean;
    showEquipmentQuestion?: boolean;
    allowsExtraCleaner?: boolean;
    step1Questions: Array<{ key: string; label: string }>;
    extraSlugs?: string[];
  }>;
};

const address = {
  address: "12 Ocean View Drive",
  suburb: "Claremont",
  contactPhone: "+27820000000",
  serviceAreaLocationId: "13bb6c75-58a4-4a89-9416-bab320aa203b",
};

describe("Airbnb Booking V2 simplified journey", () => {
  it("keeps only the canonical Airbnb intake", () => {
    const questions = SERVICE_CONFIG["airbnb-cleaning"].step1Questions;
    expect(questions.map((question) => question.key)).toEqual([
      "propertyType",
      "bedrooms",
      "bathrooms",
      "extraRooms",
      "linens",
      "keyAccess",
    ]);
    expect(questions.find((question) => question.key === "linens")?.label).toBe(
      "Fresh linen for the beds?",
    );
    expect(questions.some((question) => question.key === "guestCheckout")).toBe(false);
    expect(questions.some((question) => question.key === "welcomeBasket")).toBe(false);
    expect(
      questions.some((question) => question.key === "specialInstructions"),
    ).toBe(false);
  });

  it("keeps pricing ownership on property size while turnover setup stays informational", () => {
    expect(pricingRelevantFieldKeys("airbnb-cleaning")).toEqual([
      "propertyType",
      "bedrooms",
      "bathrooms",
      "extraRooms",
    ]);
    expect(informationalFieldKeys("airbnb-cleaning")).toEqual([
      "linens",
      "keyAccess",
    ]);
  });

  it("makes Shalean supplies included and removes equipment choice", () => {
    expect(serviceIncludesShaleanSupplies("airbnb-cleaning")).toBe(true);
    expect(serviceRequiresCustomerEquipmentChoice("airbnb-cleaning")).toBe(false);

    const airbnb = seed.services.find((service) => service.slug === "airbnb-cleaning");
    expect(airbnb?.showCleaningProductsQuestion).toBe(false);
    expect(airbnb?.showEquipmentQuestion).toBe(false);
  });

  it("makes Airbnb public turnover bookings once-off only", () => {
    expect(serviceAllowsRecurringBookings("airbnb-cleaning")).toBe(false);
    expect(
      recurringScheduleAllowedForService({
        serviceSlug: "airbnb-cleaning",
        bookingType: "recurring",
        recurringFrequency: "weekly",
        recurringDays: ["Monday"],
      }),
    ).toBe(false);
    expect(schemaSource).toContain(
      '"Airbnb Cleaning is available as a once-off turnover booking only."',
    );
    expect(contextSource).toContain(
      'serviceSlug === "carpet-cleaning" || serviceSlug === "airbnb-cleaning"',
    );
    expect(step2Source).toContain(
      "const skipsBookingTypeStage = isCarpetCleaning || isAirbnbCleaning;",
    );
  });

  it("keeps the turnover stage to fresh linen and access only", () => {
    expect(
      bookingDetailsStageReady(
        "airbnb-cleaning",
        "turnover",
        { linens: "change", keyAccess: "lockbox" },
        address,
        SERVICE_CONFIG["airbnb-cleaning"].step1Questions,
      ),
    ).toBe(true);
    expect(
      bookingDetailsStageReady(
        "airbnb-cleaning",
        "turnover",
        { linens: "change" },
        address,
        SERVICE_CONFIG["airbnb-cleaning"].step1Questions,
      ),
    ).toBe(false);
  });

  it("canonicalizes old Airbnb catalog and draft fields", () => {
    expect(catalogSource).toContain('serviceSlug === "airbnb-cleaning"');
    expect(catalogSource).toContain("SERVICE_CONFIG[serviceSlug].step1Questions");
    expect(contextSource).toContain("delete serviceDetails.guestCheckout;");
    expect(contextSource).toContain("delete serviceDetails.welcomeBasket;");
    expect(contextSource).toContain("delete serviceDetails.specialInstructions;");

    const airbnb = seed.services.find((service) => service.slug === "airbnb-cleaning");
    expect(airbnb?.step1Questions.map((question) => question.key)).toEqual([
      "propertyType",
      "bedrooms",
      "bathrooms",
      "extraRooms",
      "linens",
      "keyAccess",
    ]);
  });

  it("presents consolidated Airbnb details in Review and Summary", () => {
    expect(reviewSource).toContain('title="Airbnb details"');
    expect(summarySource).toContain('"Property"');
    expect(summarySource).toContain('"Turnover setup"');
    expect(summarySource).not.toContain(
      'optionLabel("guestCheckout", values.serviceDetails.guestCheckout)',
    );
    expect(summarySource).not.toContain(
      'optionLabel("welcomeBasket", values.serviceDetails.welcomeBasket)',
    );
  });

  it("preserves extra-cleaner pricing with the compact cleaner-count control", () => {
    expect(SERVICE_CONFIG["airbnb-cleaning"].pricePerExtraCleaner).toBeGreaterThan(0);
    expect(step2Source).toContain("Add another cleaner");
    const airbnb = seed.services.find((service) => service.slug === "airbnb-cleaning");
    expect(airbnb?.allowsExtraCleaner).toBe(true);
  });
});
