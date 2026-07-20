import { describe, expect, it } from "vitest";
import { CAPE_TOWN_LOCATIONS, locationHubPathFromAreaInput } from "@/lib/seo/capeTownLocations";

/**
 * Mirrors proxy.ts short-location redirect rule: non-exact hub segments redirect
 * via locationHubPathFromAreaInput (308 on live; acceptable to live-link crawl).
 */
function resolveLocationsProxyRedirect(pathname: string): string | null {
  const match = pathname.match(/^\/locations\/([^/]+)\/?$/);
  if (!match?.[1]) return null;
  const segment = decodeURIComponent(match[1]).trim().toLowerCase();
  const isExactHub = CAPE_TOWN_LOCATIONS.some((l) => l.slug === segment);
  if (isExactHub) return null;
  const dest = locationHubPathFromAreaInput(segment);
  if (dest === pathname.replace(/\/+$/, "") || dest === `/locations/${segment}`) return null;
  return dest;
}

describe("locations short-slug proxy redirect (OPS-CI-001)", () => {
  it("leaves exact catalogue hubs alone", () => {
    expect(resolveLocationsProxyRedirect("/locations/sea-point-cleaning-services")).toBeNull();
  });

  it("redirects short hub aliases to full hub slugs", () => {
    expect(resolveLocationsProxyRedirect("/locations/sea-point")).toBe(
      "/locations/sea-point-cleaning-services",
    );
  });

  it("redirects the ten production live-link 404 slugs to /locations", () => {
    const failing = [
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
    ];
    for (const slug of failing) {
      expect(resolveLocationsProxyRedirect(`/locations/${slug}`)).toBe("/locations");
    }
  });
});
