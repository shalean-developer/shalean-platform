import { describe, expect, it } from "vitest";
import {
  DIRECT_BOOKING_FLOW_LANDING,
  isMarketingLandingPath,
  landingDisplayName,
  resolveSessionLanding,
} from "@/lib/admin/landingPageAttribution";

describe("isMarketingLandingPath", () => {
  it("allows public marketing paths", () => {
    expect(isMarketingLandingPath("/")).toBe(true);
    expect(isMarketingLandingPath("/services/deep-cleaning-cape-town")).toBe(true);
    expect(isMarketingLandingPath("/blog/same-day-cleaning-cape-town")).toBe(true);
    expect(isMarketingLandingPath("/book/standard-cleaning")).toBe(true);
  });

  it("rejects booking funnel and internal paths", () => {
    expect(isMarketingLandingPath("/details")).toBe(false);
    expect(isMarketingLandingPath("/booking/success")).toBe(false);
    expect(isMarketingLandingPath("/book/payment")).toBe(false);
    expect(isMarketingLandingPath("/office/conversion")).toBe(false);
  });
});

describe("resolveSessionLanding", () => {
  it("prefers acquisition first touch over funnel pathname", () => {
    const landing = resolveSessionLanding(null, {
      pathname: "/details",
      acquisition_first_touch: { landing_pathname: "/services/standard-cleaning-cape-town" },
    });
    expect(landing).toBe("/services/standard-cleaning-cape-town");
  });

  it("upgrades bad landing when a marketing page_view arrives", () => {
    let landing = resolveSessionLanding(null, { pathname: "/details" }, "start_booking");
    expect(landing).toBe(DIRECT_BOOKING_FLOW_LANDING);
    landing = resolveSessionLanding(landing, { pathname: "/services" }, "page_view");
    expect(landing).toBe("/services");
  });

  it("falls back to direct booking flow bucket", () => {
    expect(resolveSessionLanding(null, { pathname: "/booking/success" }, "page_view")).toBe(
      DIRECT_BOOKING_FLOW_LANDING,
    );
  });
});

describe("landingDisplayName", () => {
  it("labels direct bucket", () => {
    expect(landingDisplayName(DIRECT_BOOKING_FLOW_LANDING)).toBe("Direct / booking flow");
  });
});
