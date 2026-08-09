import { describe, expect, it } from "vitest";
import {
  buildBookHrefFromLegacySearchParams,
  buildBookHrefFromWidgetSelection,
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

  it("hands widget selections directly to the matching canonical funnel", () => {
    const href = buildBookHrefFromWidgetSelection({
      service: "deep",
      bedrooms: 3,
      bathrooms: 2,
      extraRooms: 1,
      extras: ["inside-oven", "inside-fridge"],
      serviceAreaName: "Claremont",
      source: "home_hero",
    });

    expect(href).toBe(
      "/book/deep-cleaning?service=deep&bedrooms=3&bathrooms=2&extraRooms=1&extras=inside-oven%2Cinside-fridge&source=home_hero&location=Claremont&step=1",
    );
  });

  it("does not invent room details for estimate-only widget handoffs", () => {
    const href = buildBookHrefFromWidgetSelection({
      service: "move",
      serviceAreaName: "Sea Point",
      source: "live_widget",
    });

    expect(href).toBe(
      "/book/moving-cleaning?service=move&source=live_widget&location=Sea+Point&step=1",
    );
  });
});
