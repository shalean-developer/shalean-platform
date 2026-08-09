import { describe, expect, it } from "vitest";
import {
  bookingV2PrefillPatchFromLegacySearchParams,
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
      serviceAreaLocationId: "11111111-1111-4111-8111-111111111111",
      source: "home_hero",
    });

    expect(href).toBe(
      "/book/deep-cleaning?service=deep&bedrooms=3&bathrooms=2&extraRooms=1&extrasMode=replace&source=home_hero&serviceAreaLocationId=11111111-1111-4111-8111-111111111111&serviceAreaName=Claremont&step=1",
    );
  });

  it("does not invent room details for estimate-only widget handoffs", () => {
    const href = buildBookHrefFromWidgetSelection({
      service: "move",
      serviceAreaName: "Sea Point",
      source: "live_widget",
    });

    expect(href).toBe(
      "/book/moving-cleaning?service=move&extrasMode=replace&source=live_widget&location=Sea+Point&step=1",
    );
  });

  it("filters incompatible extras and explicitly replaces stale selections", () => {
    const href = buildBookHrefFromWidgetSelection({
      service: "carpet",
      extras: ["inside-oven", "stain-treatment"],
    });

    expect(href).toBe(
      "/book/carpet-cleaning?service=carpet&extras=stain-treatment&extrasMode=replace&step=1",
    );
  });

  it("hydrates a database-backed suburb and exact empty extras selection", () => {
    const patch = bookingV2PrefillPatchFromLegacySearchParams(
      new URLSearchParams({
        serviceAreaLocationId: "11111111-1111-4111-8111-111111111111",
        serviceAreaName: "New Service Area",
        extrasMode: "replace",
      }),
    );

    expect(patch.suburb).toBe("New Service Area");
    expect(patch.selectedExtras).toBeUndefined();
    expect(patch.replaceSelectedExtras).toBe(true);
  });
});
