import { describe, expect, it } from "vitest";
import { parseBookingV2CatalogConfig } from "@/lib/booking-v2/bookingV2ServiceDefinitions";
import { SERVICE_CONFIG } from "@/src/features/booking-v2/config/serviceConfig";

describe("MARKETING-READY-01 moving-cleaning description normalization", () => {
  it("replaces stale database-backed deposit-return copy with canonical safe wording", () => {
    const parsed = parseBookingV2CatalogConfig({
      services: [
        {
          slug: "moving-cleaning",
          pricingSlug: "move",
          label: "Moving Cleaning",
          shortLabel: "Move In/Out",
          description: "Move-in or move-out clean to ensure a smooth handover and full deposit return.",
          cleanerMode: "team",
          extraTypes: ["heavy", "all"],
          step1Questions: [],
          isActive: true,
          sortOrder: 30,
        },
      ],
    });

    expect(parsed).not.toBeNull();
    const moving = parsed?.services.find((service) => service.slug === "moving-cleaning");
    expect(moving?.description).toBe(SERVICE_CONFIG["moving-cleaning"].description);
    expect(moving?.description).not.toMatch(/full deposit return/i);
  });
});
