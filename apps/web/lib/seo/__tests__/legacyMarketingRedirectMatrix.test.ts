import { describe, expect, it } from "vitest";
import {
  LEGACY_MARKETING_EXACT_REDIRECTS,
  legacyMarketingRedirectSourcePaths,
  resolveLegacyMarketingExactRedirect,
} from "@/lib/seo/legacyMarketingRedirectMatrix";
import { KEYWORD_PRIMARY_ROUTE } from "@/lib/seo/keyword-primary-route";

describe("legacyMarketingRedirectMatrix", () => {
  it("maps P0 legacy .co.za routes to one-hop permanent destinations", () => {
    expect(resolveLegacyMarketingExactRedirect("/details")).toEqual({
      source: "/details",
      destination: "/book",
      status: 308,
    });
    expect(resolveLegacyMarketingExactRedirect("/testimonials")?.destination).toBe("/reviews");
    expect(resolveLegacyMarketingExactRedirect("/team")?.destination).toBe("/about");
    expect(resolveLegacyMarketingExactRedirect("/how-it-works")?.destination).toBe("/#how-it-works");
    expect(resolveLegacyMarketingExactRedirect("/terms")?.destination).toBe("/terms-of-service");
    expect(resolveLegacyMarketingExactRedirect("/cleaning-services-cape-town")?.destination).toBe(
      "/services",
    );
    expect(resolveLegacyMarketingExactRedirect("/cleaning-prices-cape-town")).toBeNull();
    expect(resolveLegacyMarketingExactRedirect("/pricing")?.destination).toBe(
      "/blog/how-much-does-cleaning-cost-cape-town-2026",
    );
  });

  it("normalizes trailing slashes", () => {
    expect(resolveLegacyMarketingExactRedirect("/details/")?.destination).toBe("/book");
  });

  it("never redirects sources onto themselves (no loops)", () => {
    for (const rule of LEGACY_MARKETING_EXACT_REDIRECTS) {
      expect(rule.destination.replace(/\/+$/, "")).not.toBe(rule.source);
      expect(rule.status === 301 || rule.status === 308).toBe(true);
    }
  });

  it("exposes source paths for sitemap exclusion", () => {
    expect(legacyMarketingRedirectSourcePaths()).toContain("/details");
    expect(legacyMarketingRedirectSourcePaths()).toContain("/how-it-works");
  });

  it("does not assign keyword ownership to redirect sources", () => {
    for (const route of Object.values(KEYWORD_PRIMARY_ROUTE)) {
      expect(resolveLegacyMarketingExactRedirect(route)).toBeNull();
    }
  });
});
