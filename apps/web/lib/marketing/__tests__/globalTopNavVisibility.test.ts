import { describe, expect, it } from "vitest";
import {
  shouldHideGlobalTopNav,
  usesHomepageStyledGlobalTopNav,
  usesMarketingHomeHeader,
} from "@/lib/marketing/globalTopNavVisibility";

describe("globalTopNavVisibility", () => {
  it("flags page-owned MarketingHomeHeader routes", () => {
    for (const path of [
      "/",
      "/about",
      "/faq",
      "/reviews",
      "/contact",
      "/quote",
      "/maid-services-cape-town",
      "/cleaning-prices-cape-town",
      "/privacy-policy",
      "/terms-of-service",
      "/data-deletion",
      "/data-deletion/status",
    ]) {
      expect(usesMarketingHomeHeader(path)).toBe(true);
      expect(shouldHideGlobalTopNav(path)).toBe(true);
    }
  });

  it("uses homepage-styled GlobalTopNav on primary public route families", () => {
    for (const path of [
      "/services",
      "/services/standard-cleaning-cape-town",
      "/locations",
      "/locations/sea-point-cleaning-services",
      "/blog",
      "/blog/example-post",
    ]) {
      expect(usesHomepageStyledGlobalTopNav(path)).toBe(true);
      expect(shouldHideGlobalTopNav(path)).toBe(false);
    }
  });

  it("keeps unrelated public routes on the legacy GlobalTopNav until their own normalization slice", () => {
    expect(usesHomepageStyledGlobalTopNav("/cleaning-services-cape-town")).toBe(false);
    expect(usesHomepageStyledGlobalTopNav("/office-cleaning/sea-point")).toBe(false);
  });

  it("hides GlobalTopNav on office portal but not office-cleaning SEO landings", () => {
    expect(shouldHideGlobalTopNav("/office")).toBe(true);
    expect(shouldHideGlobalTopNav("/office/bookings")).toBe(true);
    expect(shouldHideGlobalTopNav("/office-cleaning/sea-point")).toBe(false);
  });
});
