import { describe, expect, it } from "vitest";
import {
  mergeSuburbAreaLinks,
  suburbHrefByDisplayName,
  suburbHrefFromAreaSlug,
} from "@/lib/marketing/marketingAreaLinks";

describe("marketingAreaLinks", () => {
  it("maps known short suburb slugs to catalogue hubs", () => {
    expect(suburbHrefFromAreaSlug("sea-point")).toBe("/locations/sea-point-cleaning-services");
    expect(suburbHrefByDisplayName("Sea Point")).toBe("/locations/sea-point-cleaning-services");
  });

  it("maps unknown short suburb slugs to the locations overview (never invents hubs)", () => {
    for (const slug of [
      "beacon-hill",
      "big-bay",
      "bonnie-brook",
      "maitland",
      "noordhoek",
      "muizenberg",
      "melkbosstrand",
      "sun-valley",
      "zevenwacht",
      "ysterplaat",
    ]) {
      expect(suburbHrefFromAreaSlug(slug)).toBe("/locations");
    }
  });

  it("never emits /locations/{short-db-slug} for homepage merge", () => {
    const links = mergeSuburbAreaLinks([
      { id: "1", name: "Beacon Hill", city: "Cape Town", slug: "beacon-hill" },
      { id: "2", name: "Sea Point", city: "Cape Town", slug: "sea-point" },
    ]);
    const hrefs = links.map((l) => l.href);
    expect(hrefs).not.toContain("/locations/beacon-hill");
    expect(hrefs).toContain("/locations");
    expect(hrefs).toContain("/locations/sea-point-cleaning-services");
  });
});
