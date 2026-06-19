import { describe, expect, it } from "vitest";
import {
  buildBookHrefFromLegacySearchParams,
  legacyServiceIdToBookSlug,
} from "@/lib/booking/legacyBookingToBookRedirect";

describe("legacyBookingToBookRedirect", () => {
  it("maps airbnb to airbnb-cleaning slug", () => {
    expect(legacyServiceIdToBookSlug("airbnb")).toBe("airbnb-cleaning");
  });

  it("builds /book slug path with step and marketing params", () => {
    const sp = new URLSearchParams({
      service: "airbnb",
      bedrooms: "2",
      bathrooms: "1",
      location: "woodstock",
      source: "services_hub",
    });
    const href = buildBookHrefFromLegacySearchParams(sp, "schedule");
    expect(href).toContain("/book/airbnb-cleaning?");
    expect(href).toContain("step=2");
    expect(href).toContain("bedrooms=2");
    expect(href).toContain("source=services_hub");
  });
});
