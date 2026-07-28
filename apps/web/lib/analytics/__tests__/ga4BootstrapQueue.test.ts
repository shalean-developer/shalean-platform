import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { buildGoogleAnalyticsBootstrap } from "@/components/analytics/GoogleAnalytics";
import {
  GA4_CANONICAL_MEASUREMENT_ID,
  GA4_LEGACY_MEASUREMENT_IDS,
  GA4_PATH_EXCLUSION_SNIPPET,
  getGa4MeasurementId,
  isGa4PathExcluded,
} from "@/lib/analytics/ga4Config";
import {
  GA4_FUNNEL_EVENTS,
  ga4DisableTargetIds,
  gaDisableKey,
  setGa4Disabled,
  trackGa4BeginCheckout,
  trackGa4BookingReview,
  trackGa4BookingStart,
  trackGa4Event,
  trackGa4ScheduleSelected,
  trackGa4ServiceSelected,
} from "@/lib/analytics/ga4Events";
import { sanitizeGa4Params } from "@/lib/analytics/ga4Pii";

describe("GoogleAnalytics hard-load public bootstrap", () => {
  beforeEach(() => {
    const dataLayer: unknown[] = [];
    const location = { pathname: "/book/regular-cleaning" };
    vi.stubGlobal("window", { dataLayer, location, __shaleanGa4Bootstrapped: false });
    vi.stubGlobal("location", location);
    delete process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
    delete process.env.GA4_MEASUREMENT_ID;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("exposes one window.gtag and one config for the canonical ID", () => {
    const bootstrap = buildGoogleAnalyticsBootstrap(GA4_CANONICAL_MEASUREMENT_ID);
    // eslint-disable-next-line no-new-func -- execute production bootstrap string
    const run = new Function("window", "location", bootstrap);
    run(window, (window as unknown as { location: { pathname: string } }).location);

    expect(typeof window.gtag).toBe("function");
    expect(window.__shaleanGa4Bootstrapped).toBe(true);

    const layer = window.dataLayer ?? [];
    const configs = layer.filter((entry) => {
      if (!entry || typeof entry !== "object") return false;
      const a = entry as { 0?: string; 1?: string };
      return a[0] === "config" && a[1] === GA4_CANONICAL_MEASUREMENT_ID;
    });
    expect(configs).toHaveLength(1);
  });

  it("queues early funnel events before gtag.js would load", () => {
    const bootstrap = buildGoogleAnalyticsBootstrap(GA4_CANONICAL_MEASUREMENT_ID);
    // eslint-disable-next-line no-new-func -- execute production bootstrap string
    const run = new Function("window", "location", bootstrap);
    run(window, (window as unknown as { location: { pathname: string } }).location);

    trackGa4BookingStart({ service: "regular-cleaning" });
    trackGa4ServiceSelected({ service: "regular-cleaning" });
    trackGa4ScheduleSelected({ service: "regular-cleaning" });
    trackGa4BookingReview({ service: "regular-cleaning" });
    trackGa4BeginCheckout({ service: "regular-cleaning" });

    const names = (window.dataLayer ?? [])
      .filter((entry): entry is { 0: string; 1: string } => {
        if (!entry || typeof entry !== "object") return false;
        const a = entry as { 0?: string; 1?: string };
        return a[0] === "event" && typeof a[1] === "string";
      })
      .map((a) => a[1]);

    expect(names).toEqual(
      expect.arrayContaining([
        GA4_FUNNEL_EVENTS.BOOKING_START,
        GA4_FUNNEL_EVENTS.SERVICE_SELECTED,
        GA4_FUNNEL_EVENTS.SCHEDULE_SELECTED,
        GA4_FUNNEL_EVENTS.BOOKING_REVIEW,
        GA4_FUNNEL_EVENTS.BEGIN_CHECKOUT,
      ]),
    );
  });

  it("production source marks bootstrap and queues config before deferred loader", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const src = await fs.readFile(
      path.join(process.cwd(), "components/analytics/GoogleAnalytics.tsx"),
      "utf8",
    );
    const bootstrapStart = src.indexOf("const bootstrap = [");
    const slice = src.slice(bootstrapStart);
    expect(slice.indexOf('window.gtag("config"')).toBeLessThan(slice.indexOf("scheduleThirdPartyScript("));
    expect(src).toContain("__shaleanGa4Bootstrapped=true");
    expect(src).toContain("dataset.shaleanGa4");
    expect(src).toContain("window.gtag=window.gtag||function");
  });
});

describe("route exclusion and disable flags", () => {
  beforeEach(() => {
    vi.stubGlobal("window", { location: { pathname: "/" } });
    delete process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
    delete process.env.GA4_MEASUREMENT_ID;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("excludes office, private cleaner, and jobs; keeps public apply paths", () => {
    expect(isGa4PathExcluded("/office")).toBe(true);
    expect(isGa4PathExcluded("/office/bookings")).toBe(true);
    expect(isGa4PathExcluded("/cleaner")).toBe(true);
    expect(isGa4PathExcluded("/cleaner/jobs/1")).toBe(true);
    expect(isGa4PathExcluded("/cleaner/dashboard")).toBe(true);
    expect(isGa4PathExcluded("/jobs")).toBe(true);
    expect(isGa4PathExcluded("/jobs/list")).toBe(true);
    expect(isGa4PathExcluded("/cleaner/apply")).toBe(false);
    expect(isGa4PathExcluded("/cleaner/apply/form")).toBe(false);
    expect(isGa4PathExcluded("/book")).toBe(false);
  });

  it("path exclusion snippet allows /cleaner/apply", () => {
    expect(GA4_PATH_EXCLUSION_SNIPPET).toContain("cleaner\\/apply");
  });

  it("disables canonical + every legacy ID on excluded routes (once each)", () => {
    const targets = ga4DisableTargetIds();
    expect(targets).toEqual(
      expect.arrayContaining([GA4_CANONICAL_MEASUREMENT_ID, ...GA4_LEGACY_MEASUREMENT_IDS]),
    );
    expect(new Set(targets).size).toBe(targets.length);

    setGa4Disabled(true);
    const flags = window as unknown as Record<string, boolean>;
    for (const id of targets) {
      expect(flags[gaDisableKey(id)]).toBe(true);
    }
  });

  it("restores disable flags on eligible public routes", () => {
    setGa4Disabled(true);
    setGa4Disabled(false);
    const flags = window as unknown as Record<string, boolean>;
    for (const id of ga4DisableTargetIds()) {
      expect(flags[gaDisableKey(id)]).toBe(false);
    }
  });

  it("defaults to canonical Measurement ID and ignores legacy env", () => {
    expect(getGa4MeasurementId()).toBe(GA4_CANONICAL_MEASUREMENT_ID);
    process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID = GA4_LEGACY_MEASUREMENT_IDS[0];
    expect(getGa4MeasurementId()).toBe(GA4_CANONICAL_MEASUREMENT_ID);
  });
});

describe("Ga4RouteGuard public ↔ excluded transitions", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete process.env.NEXT_PUBLIC_GTM_ID;
  });

  it("bootstraps GA once when leaving an excluded hard-load", async () => {
    const appendChild = vi.fn();
    const createElement = vi.fn(() => ({ async: false, dataset: {} as Record<string, string>, src: "" }));
    const dataLayer: unknown[] = [];
    vi.stubGlobal("window", {
      dataLayer,
      location: { pathname: "/book/regular-cleaning" },
      __shaleanGa4Bootstrapped: false,
    });
    vi.stubGlobal("document", {
      querySelector: vi.fn(() => null),
      querySelectorAll: vi.fn(() => []),
      createElement,
      head: { appendChild },
    });
    delete process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

    const { ensureGa4Bootstrapped } = await import("@/components/analytics/Ga4RouteGuard");
    ensureGa4Bootstrapped();
    ensureGa4Bootstrapped();

    expect(typeof window.gtag).toBe("function");
    expect(window.__shaleanGa4Bootstrapped).toBe(true);
    expect(appendChild).toHaveBeenCalledTimes(1);
  });

  it("does not append a second gtag.js after public → excluded → public", async () => {
    const appendChild = vi.fn();
    const existing = { dataset: { shaleanGa4: GA4_CANONICAL_MEASUREMENT_ID } };
    const dataLayer: unknown[] = [];
    const gtag = vi.fn((...args: unknown[]) => {
      dataLayer.push(args);
    });
    vi.stubGlobal("window", {
      dataLayer,
      gtag,
      location: { pathname: "/book" },
      __shaleanGa4Bootstrapped: true,
      __shaleanAdsBootstrapped: true,
      __shaleanGtmBootstrapped: true,
    });
    vi.stubGlobal("document", {
      querySelector: vi.fn(() => existing),
      querySelectorAll: vi.fn(() => [existing]),
      createElement: vi.fn(),
      head: { appendChild },
    });

    const { ensureGa4Bootstrapped, ensureGoogleAdsBootstrapped, ensureGtmBootstrapped } =
      await import("@/components/analytics/Ga4RouteGuard");

    setGa4Disabled(true);
    setGa4Disabled(false);
    ensureGa4Bootstrapped();
    ensureGoogleAdsBootstrapped();
    ensureGtmBootstrapped();

    expect(appendChild).not.toHaveBeenCalled();
    const configs = dataLayer.filter((e) => Array.isArray(e) && e[0] === "config");
    expect(configs).toHaveLength(0);
  });

  it("Ga4RouteGuard source restores Ads/GTM after excluded routes", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const src = await fs.readFile(
      path.join(process.cwd(), "components/analytics/Ga4RouteGuard.tsx"),
      "utf8",
    );
    expect(src).toContain("ensureGa4Bootstrapped");
    expect(src).toContain("ensureGoogleAdsBootstrapped");
    expect(src).toContain("ensureGtmBootstrapped");
    expect(src).toContain("setGa4Disabled(excluded)");
  });

  it("Ads and GTM bootstraps mark flags to prevent duplicates", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const ads = await fs.readFile(path.join(process.cwd(), "components/analytics/GoogleAds.tsx"), "utf8");
    const gtm = await fs.readFile(
      path.join(process.cwd(), "components/analytics/GoogleTagManager.tsx"),
      "utf8",
    );
    expect(ads).toContain("__shaleanAdsBootstrapped=true");
    expect(gtm).toContain("__shaleanGtmBootstrapped=true");
    expect(gtm).toContain("dataset.shaleanGtm");
  });
});

describe("PII sanitisation", () => {
  it("strips PII keys and email/phone-shaped values from GA params", () => {
    const safe = sanitizeGa4Params({
      service: "regular-cleaning",
      branch: "cape-town",
      email: "a@b.com",
      phone: "+27821234567",
      customer_name: "Jane",
      ok: "deep-cleaning",
    });
    expect(safe.email).toBeUndefined();
    expect(safe.phone).toBeUndefined();
    expect(safe.customer_name).toBeUndefined();
    expect(safe.ok).toBe("deep-cleaning");

    trackGa4Event("booking_start", {
      service: "regular-cleaning",
      email: "leak@example.com",
    });
  });
});
