import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SERVICE_CONFIG } from "@/src/features/booking-v2/config/serviceConfig";
import { bookingDetailsStageReady } from "@/src/features/booking-v2/steps/serviceProgressiveDisclosure";
import { serviceAllowsRecurringBookings } from "@/lib/booking-v2/serviceRecurringPolicy";
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
      "officeType",
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

  it("lets the add-ons-only final Office details stage continue", () => {
    expect(
      bookingDetailsStageReady(
        "office-cleaning",
        "preferences",
        {
          officeType: "open_plan",
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
    expect(informationalFieldKeys("office-cleaning")).toEqual(["officeType"]);
    expect(serviceAllowsRecurringBookings("office-cleaning")).toBe(true);
  });

  it("normalizes old Office catalog questions and hidden equipment state at runtime", () => {
    expect(catalogSource).toContain('serviceSlug === "office-cleaning"');
    expect(catalogSource).toContain("SERVICE_CONFIG[serviceSlug].step1Questions");
    expect(catalogSource).toContain(
      'slug === "office-cleaning" || slug === "airbnb-cleaning"',
    );
  });

  it("strips retired Office draft fields before confirmation", () => {
    expect(contextSource).toContain('delete serviceDetails.frequency;');
    expect(contextSource).toContain('delete serviceDetails.afterHours;');
    expect(contextSource).toContain('delete serviceDetails.specialInstructions;');
    expect(step1Source).toContain(
      '["frequency", "afterHours", "specialInstructions"] as const',
    );
  });

  it("uses the Office pricing family and canonical Office scope in the seed", () => {
    const office = seed.services.find((service) => service.slug === "office-cleaning");
    expect(office).toBeDefined();
    expect(office?.pricingSlug).toBe("office");
    expect(office?.showCleaningProductsQuestion).toBe(false);
    expect(office?.showEquipmentQuestion).toBe(false);
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

  it("presents Office details as Office scope in Review and Summary", () => {
    expect(reviewSource).toContain('"Office scope"');
    expect(reviewSource).toContain('"Edit office scope"');
    expect(summarySource).toContain('"Office scope"');
    expect(summarySource).not.toContain(
      'optionLabel("afterHours", values.serviceDetails.afterHours)',
    );
  });
});
