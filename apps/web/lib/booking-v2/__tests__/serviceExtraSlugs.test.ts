import { describe, expect, it } from "vitest";

import {
  SERVICE_EXTRA_SLUGS,
  isExtraSlugAllowedForService,
} from "@/lib/booking-v2/serviceExtraSlugs";
import {
  SERVICE_CONFIG,
  SERVICE_SLUGS,
} from "@/src/features/booking-v2/config/serviceConfig";

describe("SERVICE_EXTRA_SLUGS", () => {
  it("defines a unique non-empty allowlist for every service", () => {
    for (const slug of SERVICE_SLUGS) {
      const slugs = SERVICE_EXTRA_SLUGS[slug];
      expect(slugs.length).toBeGreaterThan(0);
      expect(new Set(slugs).size).toBe(slugs.length);
    }
  });

  it("does not share identical sets between regular, office, and airbnb", () => {
    const regular = [...SERVICE_EXTRA_SLUGS["regular-cleaning"]].sort().join(",");
    const office = [...SERVICE_EXTRA_SLUGS["office-cleaning"]].sort().join(",");
    const airbnb = [...SERVICE_EXTRA_SLUGS["airbnb-cleaning"]].sort().join(",");

    expect(office).not.toBe(regular);
    expect(airbnb).not.toBe(regular);
    expect(airbnb).not.toBe(office);
  });

  it("shares the approved Deep/Moving set while keeping Carpet distinct", () => {
    const deep = [...SERVICE_EXTRA_SLUGS["deep-cleaning"]].sort().join(",");
    const moving = [...SERVICE_EXTRA_SLUGS["moving-cleaning"]].sort().join(",");
    const carpet = [...SERVICE_EXTRA_SLUGS["carpet-cleaning"]].sort().join(",");

    expect(moving).toBe(deep);
    expect(carpet).not.toBe(deep);
  });

  it("matches the approved six-service customer add-on contract", () => {
    expect(SERVICE_EXTRA_SLUGS["regular-cleaning"]).toEqual([
      "inside-fridge",
      "inside-oven",
      "laundry",
      "ironing",
      "interior-windows",
    ]);
    const deepMoving = [
      "balcony-cleaning",
      "deep-carpet-cleaning",
      "ceiling-cleaning",
      "garage-cleaning",
      "mattress-cleaning",
      "outside-windows",
    ];
    expect(SERVICE_EXTRA_SLUGS["deep-cleaning"]).toEqual(deepMoving);
    expect(SERVICE_EXTRA_SLUGS["moving-cleaning"]).toEqual(deepMoving);
    expect(SERVICE_EXTRA_SLUGS["office-cleaning"]).toEqual([
      "office-kitchen",
      "office-sanitisation",
      "waste-removal",
    ]);
    expect(SERVICE_EXTRA_SLUGS["carpet-cleaning"]).toEqual([
      "sofa-upholstery",
      "pet-odour-treatment",
      "fabric-protector",
      "mattress-cleaning",
    ]);
    expect(SERVICE_EXTRA_SLUGS["airbnb-cleaning"]).toEqual([
      "laundry",
      "inside-oven",
      "welcome-setup",
      "interior-windows",
      "inspection-photos",
    ]);
  });

  it("stays aligned with the customer-facing SERVICE_CONFIG cards", () => {
    for (const slug of SERVICE_SLUGS) {
      expect(SERVICE_CONFIG[slug].extras.map((extra) => extra.id)).toEqual(
        SERVICE_EXTRA_SLUGS[slug],
      );
    }
  });

  it("rejects cross-service and self-referential extras", () => {
    expect(isExtraSlugAllowedForService("carpet-cleaning", "carpet-cleaning")).toBe(false);
    expect(isExtraSlugAllowedForService("office-cleaning", "inside-fridge")).toBe(false);
    expect(isExtraSlugAllowedForService("deep-cleaning", "deep-carpet-cleaning")).toBe(true);
    expect(isExtraSlugAllowedForService("moving-cleaning", "outside-windows")).toBe(true);
    expect(isExtraSlugAllowedForService("airbnb-cleaning", "welcome-setup")).toBe(true);
  });
});
