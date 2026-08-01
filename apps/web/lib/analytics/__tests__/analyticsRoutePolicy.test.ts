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
  installAnalyticsHistoryPolicyGuard,
  installDataLayerGuard,
  notifyAnalyticsTagLoaded,
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

  it("public → excluded with Ads/GTM already loaded blocks marketing destinations", () => {
    process.env.NEXT_PUBLIC_GOOGLE_ADS_ID = "AW-11050850519";
    const dataLayer: unknown[] = [];
    const gtmProcessed: unknown[] = [];
    const gtmPush = (...items: unknown[]) => {
      gtmProcessed.push(...items);
      return Array.prototype.push.apply(dataLayer, items);
    };
    dataLayer.push = gtmPush as typeof dataLayer.push;

    vi.stubGlobal("window", {
      dataLayer,
      location: { pathname: "/cleaner/apply" },
      __shaleanGa4Bootstrapped: true,
      __shaleanAdsBootstrapped: true,
      __shaleanGtmBootstrapped: true,
      dispatchEvent: vi.fn(() => true),
    });

    applyAnalyticsRoutePolicy("/cleaner/apply");
    expect(isGa4PathExcluded("/cleaner/apply")).toBe(false);
    expect(isGa4PathExcluded("/cleaner/apply/form")).toBe(false);
    expect(window.__shaleanAnalyticsRouteEligible).toBe(true);
    dataLayer.push({ event: "page_view", page_path: "/cleaner/apply" });
    const marketingBeforeExclude = gtmProcessed.filter(
      (e) => (e as { event?: string })?.event === "page_view",
    ).length;
    expect(marketingBeforeExclude).toBe(1);

    // SPA navigate to private cleaner surface while tags remain loaded
    (window as unknown as { location: { pathname: string } }).location.pathname = "/cleaner/login";
    applyAnalyticsRoutePolicy("/cleaner/login");
    const flags = window as unknown as Record<string, boolean>;
    expect(flags[gaDisableKey(GA4_CANONICAL_MEASUREMENT_ID)]).toBe(true);
    expect(flags[gaDisableKey("AW-11050850519")]).toBe(true);
    expect(window.__shaleanAnalyticsRouteEligible).toBe(false);

    dataLayer.push({ event: "page_view", page_path: "/cleaner/login" });
    dataLayer.push({ event: "conversion", send_to: "AW-11050850519" });

    applyAnalyticsRoutePolicy("/office");
    dataLayer.push({ event: "page_view", page_path: "/office" });
    applyAnalyticsRoutePolicy("/jobs");
    dataLayer.push({ event: "page_view", page_path: "/jobs" });

    const marketingAfterExclude = gtmProcessed.filter((e) => {
      const ev = (e as { event?: string })?.event;
      return ev === "page_view" || ev === "conversion";
    });
    expect(marketingAfterExclude).toHaveLength(1);
    expect((marketingAfterExclude[0] as { page_path?: string }).page_path).toBe("/cleaner/apply");
  });

  it("tags loading after excluded navigation reinstall guard without breaking processor", () => {
    process.env.NEXT_PUBLIC_GOOGLE_ADS_ID = "AW-11050850519";
    const dataLayer: unknown[] = [];
    vi.stubGlobal("window", {
      dataLayer,
      location: { pathname: "/office" },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(() => true),
    });

    applyAnalyticsRoutePolicy("/office");
    const firstGuard = dataLayer.push;
    expect(window.__shaleanAnalyticsRouteEligible).toBe(false);

    // Deferred gtm.js replaces push after policy was installed
    const gtmProcessed: unknown[] = [];
    dataLayer.push = (...items: unknown[]) => {
      gtmProcessed.push(...items);
      return Array.prototype.push.apply(dataLayer, items);
    };
    expect(dataLayer.push).not.toBe(firstGuard);

    // onload path reapplies policy/guard (does not rely on React listener)
    notifyAnalyticsTagLoaded();
    expect(window.__shaleanNotifyAnalyticsTagLoaded).toBeTypeOf("function");
    expect(dataLayer.push).not.toBe(firstGuard);
    expect(window.__shaleanDataLayerGuardPush).toBe(dataLayer.push);

    dataLayer.push({ event: "page_view", page_path: "/office" });
    expect(gtmProcessed.filter((e) => (e as { event?: string })?.event === "page_view")).toHaveLength(
      0,
    );

    // Policy events still reach the original GTM processor
    const policyHits = gtmProcessed.filter(
      (e) =>
        e &&
        typeof e === "object" &&
        !Array.isArray(e) &&
        (e as Record<string, unknown>).event === SHALEAN_ROUTE_POLICY_EVENT,
    );
    expect(policyHits.length).toBeGreaterThanOrEqual(1);

    // excluded → public restores without stacking duplicate wrappers
    (window as unknown as { location: { pathname: string } }).location.pathname = "/book";
    applyAnalyticsRoutePolicy("/book");
    const restoredGuard = dataLayer.push;
    applyAnalyticsRoutePolicy("/book");
    expect(dataLayer.push).toBe(restoredGuard);

    dataLayer.push({ event: "page_view", page_path: "/book" });
    expect(gtmProcessed.some((e) => (e as { event?: string })?.event === "page_view")).toBe(true);
  });

  it("excluded → public restoration does not duplicate guard wrappers", () => {
    const dataLayer: unknown[] = [];
    const gtmProcessed: unknown[] = [];
    dataLayer.push = ((...items: unknown[]) => {
      gtmProcessed.push(...items);
      return Array.prototype.push.apply(dataLayer, items);
    }) as typeof dataLayer.push;

    vi.stubGlobal("window", {
      dataLayer,
      location: { pathname: "/office" },
      dispatchEvent: vi.fn(() => true),
    });

    applyAnalyticsRoutePolicy("/office");
    applyAnalyticsRoutePolicy("/book");
    const guardAfterRestore = dataLayer.push;
    applyAnalyticsRoutePolicy("/book");
    applyAnalyticsRoutePolicy("/book");
    expect(dataLayer.push).toBe(guardAfterRestore);
    expect(window.__shaleanDataLayerGuardPush).toBe(guardAfterRestore);

    // Still chains through GTM processor (not Array.prototype alone)
    const before = gtmProcessed.length;
    dataLayer.push({ event: "page_view", page_path: "/book" });
    expect(gtmProcessed.length).toBe(before + 1);
  });

  it("applies excluded policy before History API observers process navigation", () => {
    const calls: string[] = [];
    const dataLayer: unknown[] = [];
    const history = {
      pushState: vi.fn((_data: unknown, _unused: string, _url?: string | URL | null) =>
        calls.push(`push:${window.__shaleanAnalyticsRouteEligible}`),
      ),
      replaceState: vi.fn((_data: unknown, _unused: string, _url?: string | URL | null) =>
        calls.push(`replace:${window.__shaleanAnalyticsRouteEligible}`),
      ),
    };
    vi.stubGlobal("window", {
      dataLayer,
      history,
      location: { href: "https://shalean.co.za/book", pathname: "/book" },
      addEventListener: vi.fn(),
      dispatchEvent: vi.fn(() => true),
    });

    applyAnalyticsRoutePolicy("/book");
    installAnalyticsHistoryPolicyGuard();
    history.pushState({}, "", "/office/bookings");
    expect(calls).toEqual(["push:false"]);
    expect(window.__shaleanAnalyticsRouteEligible).toBe(false);

    history.replaceState({}, "", "/cleaner/apply");
    expect(calls).toEqual(["push:false", "replace:true"]);
    expect(window.__shaleanAnalyticsRouteEligible).toBe(true);
  });
});
