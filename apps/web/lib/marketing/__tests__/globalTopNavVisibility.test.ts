import { describe, expect, it } from "vitest";
import {
  shouldHideGlobalTopNav,
  usesMarketingHomeHeader,
} from "@/lib/marketing/globalTopNavVisibility";

describe("globalTopNavVisibility", () => {
  it("flags MarketingHomeHeader routes", () => {
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

  it("does not hide GlobalTopNav on MarketingLayout-only routes", () => {
    expect(shouldHideGlobalTopNav("/services")).toBe(false);
    expect(shouldHideGlobalTopNav("/locations")).toBe(false);
    expect(shouldHideGlobalTopNav("/blog")).toBe(false);
  });

  it("hides GlobalTopNav on office portal but not office-cleaning SEO landings", () => {
    expect(shouldHideGlobalTopNav("/office")).toBe(true);
    expect(shouldHideGlobalTopNav("/office/bookings")).toBe(true);
    expect(shouldHideGlobalTopNav("/office-cleaning/sea-point")).toBe(false);
  });
});
