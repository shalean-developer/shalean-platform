import { describe, expect, it } from "vitest";

import { SERVICE_EXTRA_SLUGS } from "@/lib/booking-v2/serviceExtraSlugs";
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
});
