import { describe, expect, it } from "vitest";

import {
  SERVICE_EXTRA_SLUGS,
  safeExtraSlugsForService,
} from "@/lib/booking-v2/serviceExtraSlugs";
import { SERVICE_SLUGS } from "@/src/features/booking-v2/config/serviceConfig";

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

  it("does not share identical sets between deep, moving, and carpet", () => {
    const deep = [...SERVICE_EXTRA_SLUGS["deep-cleaning"]].sort().join(",");
    const moving = [...SERVICE_EXTRA_SLUGS["moving-cleaning"]].sort().join(",");
    const carpet = [...SERVICE_EXTRA_SLUGS["carpet-cleaning"]].sort().join(",");

    expect(moving).not.toBe(deep);
    expect(carpet).not.toBe(deep);
    expect(carpet).not.toBe(moving);
  });

  it("matches Farai UAT Batch 2 product extras per service", () => {
    expect(SERVICE_EXTRA_SLUGS["regular-cleaning"]).toEqual([
      "inside-fridge",
      "inside-oven",
      "laundry",
      "ironing",
      "interior-windows",
    ]);
    expect(SERVICE_EXTRA_SLUGS["deep-cleaning"]).toEqual([
      "inside-cabinets",
      "inside-wardrobes",
      "blinds-cleaning",
      "interior-walls",
    ]);
    expect(SERVICE_EXTRA_SLUGS["moving-cleaning"]).toEqual([
      "deposit-preparation",
      "appliances-cleaning",
      "inside-cabinets",
      "garage-cleaning",
    ]);
    expect(SERVICE_EXTRA_SLUGS["office-cleaning"]).toEqual([
      "office-kitchen",
      "office-sanitisation",
      "waste-removal",
    ]);
  });

  it("blocks cross-service extras from persisted booking catalog config", () => {
    expect(
      safeExtraSlugsForService("deep-cleaning", [
        "inside-cabinets",
        "interior-walls",
        "inside-fridge",
        "laundry",
      ]),
    ).toEqual(["inside-cabinets", "interior-walls"]);

    expect(
      safeExtraSlugsForService("airbnb-cleaning", [
        "laundry",
        "inside-oven",
        "office-kitchen",
      ]),
    ).toEqual(["laundry", "inside-oven"]);
  });

  it("falls back to the canonical service extras when configured extras are wholly invalid", () => {
    expect(
      safeExtraSlugsForService("moving-cleaning", ["laundry", "office-kitchen"]),
    ).toEqual(SERVICE_EXTRA_SLUGS["moving-cleaning"]);
  });

  it("normalizes underscore slugs before validating them", () => {
    expect(
      safeExtraSlugsForService("deep-cleaning", ["inside_cabinets", "interior_walls"]),
    ).toEqual(["inside-cabinets", "interior-walls"]);
  });
});
