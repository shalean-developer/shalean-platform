import { describe, expect, it, afterEach, vi } from "vitest";
import {
  GA4_CANONICAL_MEASUREMENT_ID,
  isGa4PathExcluded,
} from "@/lib/analytics/ga4Config";
import { gaDisableKey } from "@/lib/analytics/ga4Events";
import {
  SHALEAN_ANALYTICS_ROUTE_ELIGIBLE_KEY,
  SHALEAN_ROUTE_POLICY_EVENT,
  applyAnalyticsRoutePolicy,
  getGoogleAdsMeasurementId,
  installDataLayerGuard,
} from "@/lib/analytics/analyticsRoutePolicy";

describe("analyticsRoutePolicy", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.NEXT_PUBLIC_GOOGLE_ADS_ID;
  });

  it("disables GA4 and Ads on excluded routes and restores on public routes", () => {
    process.env.NEXT_PUBLIC_GOOGLE_ADS_ID = "AW-9999999999";
    const dataLayer: unknown[] = [];
    vi.stubGlobal("window", { dataLayer, location: { pathname: "/" } });

    applyAnalyticsRoutePolicy("/office/bookings");
    const flags = window as unknown as Record<string, boolean>;
    expect(flags[gaDisableKey(GA4_CANONICAL_MEASUREMENT_ID)]).toBe(true);
    expect(flags[gaDisableKey("AW-9999999999")]).toBe(true);
    expect(window.__shaleanAnalyticsRouteEligible).toBe(false);

    applyAnalyticsRoutePolicy("/book");
    expect(flags[gaDisableKey(GA4_CANONICAL_MEASUREMENT_ID)]).toBe(false);
    expect(flags[gaDisableKey("AW-9999999999")]).toBe(false);
    expect(window.__shaleanAnalyticsRouteEligible).toBe(true);
  });

  it("keeps /cleaner/apply eligible while blocking private cleaner routes", () => {
    const dataLayer: unknown[] = [];
    vi.stubGlobal("window", { dataLayer, location: { pathname: "/" } });

    applyAnalyticsRoutePolicy("/cleaner/apply/form");
    expect(isGa4PathExcluded("/cleaner/apply/form")).toBe(false);
    expect(window.__shaleanAnalyticsRouteEligible).toBe(true);

    applyAnalyticsRoutePolicy("/cleaner/dashboard");
    expect(window.__shaleanAnalyticsRouteEligible).toBe(false);
  });

  it("publishes route policy on dataLayer for GTM exception triggers", () => {
    const dataLayer: unknown[] = [];
    vi.stubGlobal("window", { dataLayer, location: { pathname: "/book" } });

    applyAnalyticsRoutePolicy("/office");
    const policy = dataLayer.find(
      (e) =>
        e &&
        typeof e === "object" &&
        !Array.isArray(e) &&
        (e as Record<string, unknown>).event === SHALEAN_ROUTE_POLICY_EVENT,
    ) as Record<string, unknown> | undefined;
    expect(policy?.shalean_analytics_route_eligible).toBe(false);
  });

  it("blocks new dataLayer marketing events when GTM is already loaded", () => {
    const dataLayer: unknown[] = [];
    const gtmProcessed: unknown[] = [];
    const gtmPush = (...items: unknown[]) => {
      gtmProcessed.push(...items);
      return Array.prototype.push.apply(dataLayer, items);
    };
    dataLayer.push = gtmPush as typeof dataLayer.push;

    vi.stubGlobal("window", {
      dataLayer,
      location: { pathname: "/book" },
      [SHALEAN_ANALYTICS_ROUTE_ELIGIBLE_KEY]: true,
    });
    installDataLayerGuard();

    dataLayer.push({ event: "page_view", page_path: "/book" });
    expect(gtmProcessed).toHaveLength(1);

    window.__shaleanAnalyticsRouteEligible = false;
    dataLayer.push({ event: "page_view", page_path: "/office" });
    expect(gtmProcessed).toHaveLength(1);
    dataLayer.push({
      event: SHALEAN_ROUTE_POLICY_EVENT,
      shalean_analytics_route_eligible: false,
    });
    expect(gtmProcessed).toHaveLength(2);
    expect((gtmProcessed[1] as Record<string, unknown>).event).toBe(SHALEAN_ROUTE_POLICY_EVENT);

    window.__shaleanAnalyticsRouteEligible = true;
    dataLayer.push({ event: "page_view", page_path: "/book" });
    expect(gtmProcessed).toHaveLength(3);
  });

  it("defaults Google Ads destination from env", () => {
    process.env.NEXT_PUBLIC_GOOGLE_ADS_ID = "AW-1234567890";
    expect(getGoogleAdsMeasurementId()).toBe("AW-1234567890");
  });

  it("re-wraps dataLayer.push when deferred GTM replaces the processor", () => {
    const dataLayer: unknown[] = [];
    vi.stubGlobal("window", {
      dataLayer,
      location: { pathname: "/book" },
      __shaleanAnalyticsRouteEligible: true,
    });
    installDataLayerGuard();
    const firstGuard = dataLayer.push;

    const gtmProcessed: unknown[] = [];
    dataLayer.push = (...items: unknown[]) => {
      gtmProcessed.push(...items);
      return Array.prototype.push.apply(dataLayer, items);
    };

    installDataLayerGuard();
    expect(dataLayer.push).not.toBe(firstGuard);

    window.__shaleanAnalyticsRouteEligible = false;
    dataLayer.push({ event: "page_view", page_path: "/office" });
    expect(gtmProcessed).toHaveLength(0);

    window.__shaleanAnalyticsRouteEligible = true;
    dataLayer.push({ event: "page_view", page_path: "/book" });
    expect(gtmProcessed).toHaveLength(1);
  });
});
