import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { buildGoogleAnalyticsBootstrap } from "@/components/analytics/GoogleAnalytics";
import { GA4_CANONICAL_MEASUREMENT_ID, GA4_LEGACY_MEASUREMENT_IDS } from "@/lib/analytics/ga4Config";
import {
  GA4_FUNNEL_EVENTS,
  ga4DisableTargetIds,
  gaDisableKey,
  setGa4Disabled,
  trackGa4BeginCheckout,
  trackGa4BookingReview,
  trackGa4BookingStart,
  trackGa4ScheduleSelected,
  trackGa4ServiceSelected,
} from "@/lib/analytics/ga4Events";

describe("GoogleAnalytics window.gtag bootstrap queue", () => {
  beforeEach(() => {
    const dataLayer: unknown[] = [];
    const location = { pathname: "/book/regular-cleaning" };
    const win: Record<string, unknown> = { dataLayer, location };
    vi.stubGlobal("window", win);
    vi.stubGlobal("location", location);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("exposes window.gtag immediately so early funnel events queue before gtag.js", () => {
    const bootstrap = buildGoogleAnalyticsBootstrap(GA4_CANONICAL_MEASUREMENT_ID);
    // Run bootstrap with explicit window/location (Node has no DOM globals).
    // eslint-disable-next-line no-new-func -- intentional execution of production bootstrap string
    const run = new Function("window", "location", bootstrap);
    run(window, (window as unknown as { location: { pathname: string } }).location);

    expect(typeof window.gtag).toBe("function");

    // Dispatch funnel events before any external gtag.js would load — they must queue.
    trackGa4BookingStart({ service: "regular-cleaning" });
    trackGa4ServiceSelected({ service: "regular-cleaning" });
    trackGa4ScheduleSelected({ service: "regular-cleaning" });
    trackGa4BookingReview({ service: "regular-cleaning" });
    trackGa4BeginCheckout({ service: "regular-cleaning" });

    const layer = window.dataLayer ?? [];
    const gtagEventNames = layer
      .filter((entry): entry is { 0: string; 1: string } => {
        if (!entry || typeof entry !== "object") return false;
        const a = entry as { 0?: string; 1?: string };
        return a[0] === "event" && typeof a[1] === "string";
      })
      .map((a) => a[1]);

    expect(gtagEventNames).toEqual(
      expect.arrayContaining([
        GA4_FUNNEL_EVENTS.BOOKING_START,
        GA4_FUNNEL_EVENTS.SERVICE_SELECTED,
        GA4_FUNNEL_EVENTS.SCHEDULE_SELECTED,
        GA4_FUNNEL_EVENTS.BOOKING_REVIEW,
        GA4_FUNNEL_EVENTS.BEGIN_CHECKOUT,
      ]),
    );
  });

  it("bootstrap source assigns window.gtag (not a local-only function)", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const src = await fs.readFile(
      path.join(process.cwd(), "components/analytics/GoogleAnalytics.tsx"),
      "utf8",
    );
    expect(src).toContain("window.gtag=window.gtag||function");
    expect(src).toContain("__shaleanGa4Bootstrapped=true");
    expect(src).toContain("dataset.shaleanGa4");
    // Production bootstrap queues config in the inline script body before scheduling gtag.js.
    const bootstrapStart = src.indexOf("const bootstrap = [");
    expect(bootstrapStart).toBeGreaterThan(-1);
    const bootstrapSlice = src.slice(bootstrapStart);
    const configIdx = bootstrapSlice.indexOf('window.gtag("config"');
    const scheduleIdx = bootstrapSlice.indexOf("scheduleThirdPartyScript(");
    expect(configIdx).toBeGreaterThan(-1);
    expect(scheduleIdx).toBeGreaterThan(configIdx);
    expect(src).not.toContain('s.onload=function(){window.gtag("config"');
    expect(src).not.toMatch(/["']function gtag\(\)\{dataLayer\.push/);
  });
});

describe("setGa4Disabled internal-route flags", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {
      location: { pathname: "/" },
    });
    delete process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
    delete process.env.GA4_MEASUREMENT_ID;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("disables canonical and every legacy Measurement ID on excluded routes", () => {
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

  it("restores (clears disable) on eligible public routes", () => {
    setGa4Disabled(true);
    setGa4Disabled(false);
    const flags = window as unknown as Record<string, boolean>;
    for (const id of ga4DisableTargetIds()) {
      expect(flags[gaDisableKey(id)]).toBe(false);
    }
  });

  it("does not double-assign the canonical disable key", () => {
    const keys = ga4DisableTargetIds().map(gaDisableKey);
    expect(keys.filter((k) => k === gaDisableKey(GA4_CANONICAL_MEASUREMENT_ID))).toHaveLength(1);
  });
});

describe("Ga4RouteGuard bootstrap after excluded hard load", () => {
  it("ensureGa4Bootstrapped installs window.gtag and schedules the loader", async () => {
    const appendChild = vi.fn();
    const querySelector = vi.fn(() => null);
    const createElement = vi.fn(() => ({ async: false, dataset: {} as Record<string, string>, src: "" }));
    const dataLayer: unknown[] = [];
    const win: Record<string, unknown> = {
      dataLayer,
      location: { pathname: "/book/regular-cleaning" },
      __shaleanGa4Bootstrapped: false,
    };
    vi.stubGlobal("window", win);
    vi.stubGlobal("document", {
      querySelector,
      createElement,
      head: { appendChild },
    });
    delete process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
    delete process.env.GA4_MEASUREMENT_ID;

    const { ensureGa4Bootstrapped } = await import("@/components/analytics/Ga4RouteGuard");
    ensureGa4Bootstrapped();

    expect(typeof window.gtag).toBe("function");
    expect(window.__shaleanGa4Bootstrapped).toBe(true);
    expect(appendChild).toHaveBeenCalled();
    expect(createElement).toHaveBeenCalledWith("script");

    vi.unstubAllGlobals();
  });

  it("Ga4RouteGuard source calls ensureGa4Bootstrapped when leaving excluded routes", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const src = await fs.readFile(
      path.join(process.cwd(), "components/analytics/Ga4RouteGuard.tsx"),
      "utf8",
    );
    expect(src).toContain("ensureGa4Bootstrapped");
    expect(src).toContain("setGa4Disabled(excluded)");
  });
});
