import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { buildGoogleAnalyticsBootstrap } from "@/components/analytics/GoogleAnalytics";
import {
  GA4_CANONICAL_MEASUREMENT_ID,
  GA4_LEGACY_MEASUREMENT_IDS,
  GA4_PATH_EXCLUSION_SNIPPET,
  getGa4ConfigOptions,
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
  trackGa4BookingSubmitted,
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

  it("synchronously queues window.gtag and one canonical config", () => {
    const bootstrap = buildGoogleAnalyticsBootstrap(GA4_CANONICAL_MEASUREMENT_ID);
    // eslint-disable-next-line no-new-func -- execute production bootstrap string
    const run = new Function("window", "location", bootstrap);
    run(window, (window as unknown as { location: { pathname: string } }).location);

    expect(typeof window.gtag).toBe("function");
    expect(window.__shaleanGa4Bootstrapped).toBe(true);

    const configs = (window.dataLayer ?? []).filter((entry) => {
      if (!entry || typeof entry !== "object") return false;
      const a = entry as { 0?: string; 1?: string };
      return a[0] === "config" && a[1] === GA4_CANONICAL_MEASUREMENT_ID;
    });
    expect(configs).toHaveLength(1);
  });

  it("queues early funnel events after config is on the dataLayer", () => {
    const bootstrap = buildGoogleAnalyticsBootstrap(GA4_CANONICAL_MEASUREMENT_ID);
    // eslint-disable-next-line no-new-func -- execute production bootstrap string
    const run = new Function("window", "location", bootstrap);
    run(window, (window as unknown as { location: { pathname: string } }).location);

    trackGa4BookingStart({ service: "regular-cleaning" });
    trackGa4ServiceSelected({ service: "regular-cleaning" });
    trackGa4ScheduleSelected({ service: "regular-cleaning" });
    trackGa4BookingReview({ service: "regular-cleaning" });
    trackGa4BeginCheckout({ service: "regular-cleaning" });

    const layer = window.dataLayer ?? [];
    const firstConfigIdx = layer.findIndex((entry) => {
      if (!entry || typeof entry !== "object") return false;
      const a = entry as { 0?: string };
      return a[0] === "config";
    });
    const firstFunnelIdx = layer.findIndex((entry) => {
      if (!entry || typeof entry !== "object") return false;
      const a = entry as { 0?: string; 1?: string };
      return a[0] === "event" && a[1] === GA4_FUNNEL_EVENTS.BOOKING_START;
    });
    expect(firstConfigIdx).toBeGreaterThanOrEqual(0);
    expect(firstFunnelIdx).toBeGreaterThan(firstConfigIdx);
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

  it("excludes office/jobs/private cleaner; keeps /cleaner/apply and /cleaner/apply/form", () => {
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
    expect(GA4_PATH_EXCLUSION_SNIPPET).toContain("cleaner\\/apply");
  });

  it("disables canonical + every legacy ID once; restores on public routes", () => {
    const targets = ga4DisableTargetIds();
    expect(targets).toEqual(
      expect.arrayContaining([GA4_CANONICAL_MEASUREMENT_ID, ...GA4_LEGACY_MEASUREMENT_IDS]),
    );
    expect(new Set(targets).size).toBe(targets.length);

    setGa4Disabled(true);
    const flags = window as unknown as Record<string, boolean>;
    for (const id of targets) expect(flags[gaDisableKey(id)]).toBe(true);

    setGa4Disabled(false);
    for (const id of targets) expect(flags[gaDisableKey(id)]).toBe(false);
  });

  it("defaults to canonical Measurement ID and ignores legacy env", () => {
    expect(getGa4MeasurementId()).toBe(GA4_CANONICAL_MEASUREMENT_ID);
    process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID = GA4_LEGACY_MEASUREMENT_IDS[0];
    expect(getGa4MeasurementId()).toBe(GA4_CANONICAL_MEASUREMENT_ID);
  });
});

describe("Ga4RouteGuard transitions and idempotency", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete process.env.NEXT_PUBLIC_GTM_ID;
    delete process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
  });

  it("bootstraps GA/Ads/GTM once when leaving an excluded hard-load", async () => {
    const appendChild = vi.fn();
    const createElement = vi.fn(() => ({ async: false, dataset: {} as Record<string, string>, src: "" }));
    const dataLayer: unknown[] = [];
    vi.stubGlobal("window", {
      dataLayer,
      location: { pathname: "/book/regular-cleaning" },
      __shaleanGa4Bootstrapped: false,
      __shaleanAdsBootstrapped: false,
      __shaleanGtmBootstrapped: false,
      sessionStorage: { getItem: () => null, setItem: () => undefined },
    });
    vi.stubGlobal("document", {
      querySelector: vi.fn(() => null),
      querySelectorAll: vi.fn(() => []),
      createElement,
      head: { appendChild },
    });
    process.env.NEXT_PUBLIC_GTM_ID = "GTM-TEST123";

    const {
      ensureGa4Bootstrapped,
      ensureGoogleAdsBootstrapped,
      ensureGtmBootstrapped,
    } = await import("@/components/analytics/Ga4RouteGuard");

    ensureGa4Bootstrapped();
    ensureGoogleAdsBootstrapped();
    ensureGtmBootstrapped();
    ensureGa4Bootstrapped();
    ensureGoogleAdsBootstrapped();
    ensureGtmBootstrapped();

    expect(typeof window.gtag).toBe("function");
    expect(window.__shaleanGa4Bootstrapped).toBe(true);
    expect(window.__shaleanAdsBootstrapped).toBe(true);
    expect(window.__shaleanGtmBootstrapped).toBe(true);
    // one gtag.js + one gtm.js
    expect(appendChild).toHaveBeenCalledTimes(2);
  });

  it("public → excluded → public does not duplicate loaders or config", async () => {
    const appendChild = vi.fn();
    const existingGa = { dataset: { shaleanGa4: GA4_CANONICAL_MEASUREMENT_ID }, src: "" };
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
      querySelector: vi.fn(() => existingGa),
      querySelectorAll: vi.fn(() => [existingGa]),
      createElement: vi.fn(),
      head: { appendChild },
    });

    const { ensureGa4Bootstrapped, ensureGoogleAdsBootstrapped, ensureGtmBootstrapped, syncGa4RoutePolicy } =
      await import("@/components/analytics/Ga4RouteGuard");

    syncGa4RoutePolicy("/office");
    syncGa4RoutePolicy("/book");
    ensureGa4Bootstrapped();
    ensureGoogleAdsBootstrapped();
    ensureGtmBootstrapped();

    expect(appendChild).not.toHaveBeenCalled();
    const configs = dataLayer.filter((e) => Array.isArray(e) && e[0] === "config" && e[1] === GA4_CANONICAL_MEASUREMENT_ID);
    expect(configs).toHaveLength(0);
  });

  it("syncGa4RoutePolicy clears disable before funnel events on /office → /book", async () => {
    process.env.NEXT_PUBLIC_GOOGLE_ADS_ID = "AW-9999999999";
    vi.stubGlobal("window", {
      dataLayer: [] as unknown[],
      location: { pathname: "/office" },
      __shaleanGa4Bootstrapped: false,
      sessionStorage: { getItem: () => null, setItem: () => undefined },
    });
    vi.stubGlobal("document", {
      querySelector: vi.fn(() => null),
      querySelectorAll: vi.fn(() => []),
      createElement: vi.fn(() => ({ async: false, dataset: {} as Record<string, string>, src: "" })),
      head: { appendChild: vi.fn() },
    });

    const { syncGa4RoutePolicy } = await import("@/components/analytics/Ga4RouteGuard");
    syncGa4RoutePolicy("/office");
    const flags = window as unknown as Record<string, boolean>;
    expect(flags[gaDisableKey(GA4_CANONICAL_MEASUREMENT_ID)]).toBe(true);
    expect(flags[gaDisableKey("AW-9999999999")]).toBe(true);
    expect(window.__shaleanAnalyticsRouteEligible).toBe(false);

    (window as unknown as { location: { pathname: string } }).location.pathname = "/book/regular-cleaning";
    syncGa4RoutePolicy("/book/regular-cleaning");
    expect(flags[gaDisableKey(GA4_CANONICAL_MEASUREMENT_ID)]).toBe(false);
    expect(flags[gaDisableKey("AW-9999999999")]).toBe(false);
    expect(window.__shaleanAnalyticsRouteEligible).toBe(true);

    trackGa4BookingStart({ service: "regular-cleaning" });
    trackGa4ServiceSelected({ service: "regular-cleaning" });
    const names = ((window.dataLayer ?? []) as unknown[])
      .filter((entry): entry is { 0: string; 1: string } => {
        if (!entry || typeof entry !== "object") return false;
        const a = entry as { 0?: string; 1?: string };
        return a[0] === "event" && typeof a[1] === "string";
      })
      .map((a) => a[1]);
    expect(names).toEqual(
      expect.arrayContaining([GA4_FUNNEL_EVENTS.BOOKING_START, GA4_FUNNEL_EVENTS.SERVICE_SELECTED]),
    );
  });

  it("root layout mounts Ga4RouteGuard before children", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const src = await fs.readFile(path.join(process.cwd(), "app/layout.tsx"), "utf8");
    // Match the JSX mount order (ignore comment that mentions {children}).
    const mount = src.match(/<Ga4RouteGuard\s*\/>\s*\{children\}/);
    expect(mount).not.toBeNull();
  });

  it("Ga4RouteGuard uses useLayoutEffect for sync policy", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const src = await fs.readFile(
      path.join(process.cwd(), "components/analytics/Ga4RouteGuard.tsx"),
      "utf8",
    );
    expect(src).toContain("useLayoutEffect");
    expect(src).toContain("ensureGoogleAdsBootstrapped");
    expect(src).toContain("ensureGtmBootstrapped");
  });
});

describe("booking_submitted once after confirm", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
      clear: () => store.clear(),
      key: () => null,
      length: 0,
    };
    vi.stubGlobal("window", {
      dataLayer: [] as unknown[],
      location: { pathname: "/book/regular-cleaning" },
      gtag: (...args: unknown[]) => {
        (window.dataLayer as unknown[]).push(args);
      },
      localStorage: storage,
      sessionStorage: storage,
    });
    delete process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("requires bookingId and fires once per booking id", () => {
    trackGa4BookingSubmitted({
      bookingId: "11111111-1111-4111-8111-111111111111",
      service: "regular-cleaning",
    });
    trackGa4BookingSubmitted({
      bookingId: "11111111-1111-4111-8111-111111111111",
      service: "regular-cleaning",
    });
    trackGa4BookingSubmitted({
      bookingId: "22222222-2222-4222-8222-222222222222",
      service: "deep-cleaning",
    });

    const submitted = ((window.dataLayer ?? []) as unknown[])
      .filter((entry): entry is { 0: string; 1: string } => {
        if (!entry || typeof entry !== "object") return false;
        const a = entry as { 0?: string; 1?: string };
        return a[0] === "event" && a[1] === GA4_FUNNEL_EVENTS.BOOKING_SUBMITTED;
      });
    expect(submitted).toHaveLength(2);
  });

  it("dedupes booking_submitted via localStorage across simulated sessions", () => {
    const store = new Map<string, string>();
    (window as unknown as { localStorage: Storage }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
      clear: () => store.clear(),
      key: () => null,
      length: 0,
    } as Storage;

    trackGa4BookingSubmitted({
      bookingId: "33333333-3333-4333-8333-333333333333",
      service: "regular-cleaning",
    });
    // Simulate new tab / session with same origin localStorage.
    (window.dataLayer as unknown[]).length = 0;
    trackGa4BookingSubmitted({
      bookingId: "33333333-3333-4333-8333-333333333333",
      service: "regular-cleaning",
    });
    const submitted = ((window.dataLayer ?? []) as unknown[]).filter((entry) => {
      if (!entry || typeof entry !== "object") return false;
      const a = entry as { 0?: string; 1?: string; event?: string };
      if (a[0] === "event" && a[1] === GA4_FUNNEL_EVENTS.BOOKING_SUBMITTED) return true;
      return a.event === GA4_FUNNEL_EVENTS.BOOKING_SUBMITTED;
    });
    expect(submitted).toHaveLength(0);
    expect(store.has("shalean_ga4_booking_submitted_33333333-3333-4333-8333-333333333333")).toBe(
      true,
    );
  });

  it("does not write dedupe marker when GA send is blocked", () => {
    (window as unknown as { location: { pathname: string } }).location.pathname = "/office";
    const store = new Map<string, string>();
    (window as unknown as { localStorage: Storage }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
      clear: () => store.clear(),
      key: () => null,
      length: 0,
    } as Storage;

    trackGa4BookingSubmitted({
      bookingId: "44444444-4444-4444-8444-444444444444",
      service: "regular-cleaning",
    });

    expect(store.size).toBe(0);
    ((window as unknown as { location: { pathname: string } }).location.pathname = "/book/regular-cleaning");
    trackGa4BookingSubmitted({
      bookingId: "44444444-4444-4444-8444-444444444444",
      service: "regular-cleaning",
    });
    expect(store.size).toBe(1);
  });

  it("telemetry does not emit booking_submitted on step-4 entry", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const telemetry = await fs.readFile(
      path.join(process.cwd(), "src/features/booking-v2/hooks/useBookingV2FunnelTelemetry.ts"),
      "utf8",
    );
    const step4 = await fs.readFile(
      path.join(process.cwd(), "src/features/booking-v2/steps/Step4Payment.tsx"),
      "utf8",
    );
    const successPage = await fs.readFile(
      path.join(process.cwd(), "app/booking/success/page.tsx"),
      "utf8",
    );
    expect(telemetry).not.toContain("trackGa4BookingSubmitted");
    expect(telemetry).toContain("trackGa4BeginCheckout");
    expect(step4).not.toContain("trackGa4BookingSubmitted");
    expect(successPage).toContain("trackGa4BookingSubmitted");
    expect(successPage).toMatch(/isBookingPersisted[\s\S]*trackGa4BookingSubmitted[\s\S]*completedRef/);
    expect(successPage).toMatch(/trackGa4BookingSubmitted[\s\S]*markRetargetingCandidate/);
    // Area-review path must not count as booking_submitted.
    const areaIdx = step4.indexOf("areaReview=1");
    const areaSlice = step4.slice(Math.max(0, areaIdx - 400), areaIdx + 80);
    expect(areaSlice).not.toContain("trackGa4BookingSubmitted");
  });

  it("appends gtag.js when config was queued but deferred loader skipped", async () => {
    const appendChild = vi.fn();
    const createElement = vi.fn(() => ({ async: false, dataset: {} as Record<string, string>, src: "" }));
    const dataLayer: unknown[] = [];
    const gtag = vi.fn((...args: unknown[]) => {
      dataLayer.push(args);
    });
    vi.stubGlobal("window", {
      dataLayer,
      gtag,
      location: { pathname: "/book" },
      __shaleanGa4Bootstrapped: true,
    });
    vi.stubGlobal("document", {
      querySelector: vi.fn(() => null),
      querySelectorAll: vi.fn(() => []),
      createElement,
      head: { appendChild },
    });

    const { ensureGa4Bootstrapped } = await import("@/components/analytics/Ga4RouteGuard");
    ensureGa4Bootstrapped();
    ensureGa4Bootstrapped();

    expect(appendChild).toHaveBeenCalledTimes(1);
    const configs = dataLayer.filter((e) => Array.isArray(e) && e[0] === "config");
    expect(configs).toHaveLength(0);
  });

  it("GTM bootstrap uses a valid data-shalean-gtm attribute selector", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const src = await fs.readFile(
      path.join(process.cwd(), "components/analytics/GoogleTagManager.tsx"),
      "utf8",
    );
    expect(src).toContain("JSON.stringify(${id})");
    expect(src).toContain("dataset.shaleanGtm");
    expect(src).toContain("__shaleanGtmBootstrapped=true");
  });
});

describe("GTM noscript and path policy", () => {
  it("does not render a global noscript iframe (root layout cannot path-gate noscript)", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const src = await fs.readFile(
      path.join(process.cwd(), "components/analytics/GoogleTagManager.tsx"),
      "utf8",
    );
    expect(src).not.toContain("googletagmanager.com/ns.html");
    expect(src).not.toMatch(/<noscript[\s>]/);
    expect(src).not.toMatch(/return\s*\([\s\S]*<iframe/);
  });

  it("gates JS GTM bootstrap on excluded routes via GA4_PATH_EXCLUSION_SNIPPET", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const src = await fs.readFile(
      path.join(process.cwd(), "components/analytics/GoogleTagManager.tsx"),
      "utf8",
    );
    expect(src).toContain("GA4_PATH_EXCLUSION_SNIPPET");
    expect(isGa4PathExcluded("/office")).toBe(true);
    expect(isGa4PathExcluded("/office/bookings")).toBe(true);
    expect(isGa4PathExcluded("/jobs")).toBe(true);
    expect(isGa4PathExcluded("/jobs/list")).toBe(true);
    expect(isGa4PathExcluded("/cleaner/dashboard")).toBe(true);
    expect(isGa4PathExcluded("/cleaner/jobs/1")).toBe(true);
  });

  it("keeps public cleaner application routes eligible for GTM", () => {
    expect(isGa4PathExcluded("/cleaner/apply")).toBe(false);
    expect(isGa4PathExcluded("/cleaner/apply/form")).toBe(false);
  });

  it("loads GTM once on a public route", async () => {
    const appendChild = vi.fn();
    const createElement = vi.fn(() => ({ async: false, dataset: {} as Record<string, string>, src: "" }));
    vi.stubGlobal("window", {
      dataLayer: [] as unknown[],
      location: { pathname: "/" },
      __shaleanGtmBootstrapped: false,
    });
    vi.stubGlobal("document", {
      querySelector: vi.fn(() => null),
      querySelectorAll: vi.fn(() => []),
      createElement,
      head: { appendChild },
    });
    process.env.NEXT_PUBLIC_GTM_ID = "GTM-TEST123";

    const { ensureGtmBootstrapped } = await import("@/components/analytics/Ga4RouteGuard");
    ensureGtmBootstrapped();
    ensureGtmBootstrapped();

    expect(appendChild).toHaveBeenCalledTimes(1);
    expect(window.__shaleanGtmBootstrapped).toBe(true);

    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete process.env.NEXT_PUBLIC_GTM_ID;
  });

  it("public → excluded → public does not duplicate GTM container", async () => {
    const appendChild = vi.fn();
    const existingGtm = { dataset: { shaleanGtm: "GTM-TEST123" }, src: "" };
    vi.stubGlobal("window", {
      dataLayer: [] as unknown[],
      location: { pathname: "/book" },
      __shaleanGtmBootstrapped: true,
      __shaleanGa4Bootstrapped: true,
      __shaleanGa4LoaderPresent: true,
    });
    vi.stubGlobal("document", {
      querySelector: vi.fn((sel: string) => {
        const s = String(sel);
        if (s.includes("data-shalean-gtm")) return existingGtm;
        if (s.includes("data-shalean-ga4")) return { dataset: { shaleanGa4: GA4_CANONICAL_MEASUREMENT_ID }, src: "" };
        return null;
      }),
      querySelectorAll: vi.fn(() => [existingGtm]),
      createElement: vi.fn(),
      head: { appendChild },
    });
    process.env.NEXT_PUBLIC_GTM_ID = "GTM-TEST123";

    const { ensureGtmBootstrapped } = await import("@/components/analytics/Ga4RouteGuard");
    (window as unknown as { location: { pathname: string } }).location.pathname = "/office";
    ensureGtmBootstrapped();
    (window as unknown as { location: { pathname: string } }).location.pathname = "/book";
    ensureGtmBootstrapped();

    expect(appendChild).not.toHaveBeenCalled();
    expect(window.__shaleanGtmBootstrapped).toBe(true);

    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete process.env.NEXT_PUBLIC_GTM_ID;
  });
});

describe("GA4 debug_mode env gating", () => {
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_GA4_DEBUG_MODE;
  });

  it("includes debug_mode:true in the initial config when env var is set", async () => {
    process.env.NEXT_PUBLIC_GA4_DEBUG_MODE = "true";
    vi.resetModules();
    const { GoogleAnalytics } = await import("@/components/analytics/GoogleAnalytics");
    const el = GoogleAnalytics();
    const html: string = el.props.dangerouslySetInnerHTML.__html;
    expect(html).toContain("debug_mode:true");
  });

  it("omits debug_mode when env var is unset (production default)", async () => {
    delete process.env.NEXT_PUBLIC_GA4_DEBUG_MODE;
    vi.resetModules();
    const { GoogleAnalytics } = await import("@/components/analytics/GoogleAnalytics");
    const el = GoogleAnalytics();
    const html: string = el.props.dangerouslySetInnerHTML.__html;
    expect(html).not.toContain("debug_mode");
  });

  it("includes debug_mode when env var is '1'", async () => {
    process.env.NEXT_PUBLIC_GA4_DEBUG_MODE = "1";
    vi.resetModules();
    const { GoogleAnalytics } = await import("@/components/analytics/GoogleAnalytics");
    const el = GoogleAnalytics();
    const html: string = el.props.dangerouslySetInnerHTML.__html;
    expect(html).toContain("debug_mode:true");
  });

  it("excluded routes still skip GA4 bootstrap even with debug_mode enabled", () => {
    process.env.NEXT_PUBLIC_GA4_DEBUG_MODE = "true";
    expect(isGa4PathExcluded("/office")).toBe(true);
    expect(isGa4PathExcluded("/jobs")).toBe(true);
    expect(isGa4PathExcluded("/cleaner/dashboard")).toBe(true);
    expect(isGa4PathExcluded("/cleaner/apply")).toBe(false);
    expect(isGa4PathExcluded("/book")).toBe(false);
  });

  it("buildGoogleAnalyticsBootstrap (test helper) never includes debug_mode", () => {
    process.env.NEXT_PUBLIC_GA4_DEBUG_MODE = "true";
    const bootstrap = buildGoogleAnalyticsBootstrap(GA4_CANONICAL_MEASUREMENT_ID);
    expect(bootstrap).not.toContain("debug_mode");
  });

  it("getGa4ConfigOptions returns debug_mode when env is set", () => {
    process.env.NEXT_PUBLIC_GA4_DEBUG_MODE = "true";
    const opts = getGa4ConfigOptions();
    expect(opts.debug_mode).toBe(true);
    expect(opts.send_page_view).toBe(true);
  });

  it("getGa4ConfigOptions omits debug_mode when env is unset", () => {
    delete process.env.NEXT_PUBLIC_GA4_DEBUG_MODE;
    const opts = getGa4ConfigOptions();
    expect(opts.debug_mode).toBeUndefined();
    expect(opts.send_page_view).toBe(true);
  });

  it("SPA bootstrap (excluded → public) includes debug_mode when env is set", async () => {
    process.env.NEXT_PUBLIC_GA4_DEBUG_MODE = "true";
    vi.resetModules();

    const dataLayer: unknown[] = [];
    const appendChild = vi.fn();
    const createElement = vi.fn(() => ({ async: false, dataset: {} as Record<string, string>, src: "" }));
    vi.stubGlobal("window", {
      dataLayer,
      location: { pathname: "/book" },
      __shaleanGa4Bootstrapped: false,
      __shaleanAdsBootstrapped: false,
      __shaleanGtmBootstrapped: false,
      sessionStorage: { getItem: () => null, setItem: () => undefined },
    });
    vi.stubGlobal("document", {
      querySelector: vi.fn(() => null),
      querySelectorAll: vi.fn(() => []),
      createElement,
      head: { appendChild },
    });

    const { ensureGa4Bootstrapped } = await import("@/components/analytics/Ga4RouteGuard");
    ensureGa4Bootstrapped();

    const configs = dataLayer.filter((e) => {
      if (!e || typeof e !== "object") return false;
      const a = e as { 0?: string; 1?: string };
      return a[0] === "config" && a[1] === GA4_CANONICAL_MEASUREMENT_ID;
    });
    expect(configs).toHaveLength(1);
    const configOpts = (configs[0] as { 2?: Record<string, unknown> })[2]!;
    expect(configOpts.debug_mode).toBe(true);
  });

  it("SPA bootstrap (excluded → public) omits debug_mode when env is unset", async () => {
    delete process.env.NEXT_PUBLIC_GA4_DEBUG_MODE;
    vi.resetModules();

    const dataLayer: unknown[] = [];
    const appendChild = vi.fn();
    const createElement = vi.fn(() => ({ async: false, dataset: {} as Record<string, string>, src: "" }));
    vi.stubGlobal("window", {
      dataLayer,
      location: { pathname: "/book" },
      __shaleanGa4Bootstrapped: false,
      __shaleanAdsBootstrapped: false,
      __shaleanGtmBootstrapped: false,
      sessionStorage: { getItem: () => null, setItem: () => undefined },
    });
    vi.stubGlobal("document", {
      querySelector: vi.fn(() => null),
      querySelectorAll: vi.fn(() => []),
      createElement,
      head: { appendChild },
    });

    const { ensureGa4Bootstrapped } = await import("@/components/analytics/Ga4RouteGuard");
    ensureGa4Bootstrapped();

    const configs = dataLayer.filter((e) => {
      if (!e || typeof e !== "object") return false;
      const a = e as { 0?: string; 1?: string };
      return a[0] === "config" && a[1] === GA4_CANONICAL_MEASUREMENT_ID;
    });
    expect(configs).toHaveLength(1);
    const configOpts = (configs[0] as { 2?: Record<string, unknown> })[2]!;
    expect(configOpts.debug_mode).toBeUndefined();
  });

  it("SPA bootstrap does not duplicate config or loader on second call", async () => {
    process.env.NEXT_PUBLIC_GA4_DEBUG_MODE = "true";
    vi.resetModules();

    const dataLayer: unknown[] = [];
    const appendChild = vi.fn();
    const existingGa = { dataset: { shaleanGa4: GA4_CANONICAL_MEASUREMENT_ID }, src: "" };
    vi.stubGlobal("window", {
      dataLayer,
      location: { pathname: "/book" },
      __shaleanGa4Bootstrapped: true,
      __shaleanGa4LoaderPresent: true,
    });
    vi.stubGlobal("document", {
      querySelector: vi.fn(() => existingGa),
      querySelectorAll: vi.fn(() => [existingGa]),
      createElement: vi.fn(),
      head: { appendChild },
    });

    const { ensureGa4Bootstrapped } = await import("@/components/analytics/Ga4RouteGuard");
    ensureGa4Bootstrapped();
    ensureGa4Bootstrapped();

    expect(appendChild).not.toHaveBeenCalled();
    const configs = dataLayer.filter((e) => Array.isArray(e) && e[0] === "config");
    expect(configs).toHaveLength(0);
  });

  it("excluded routes remain disabled even with debug_mode enabled", async () => {
    process.env.NEXT_PUBLIC_GA4_DEBUG_MODE = "true";
    vi.resetModules();

    const dataLayer: unknown[] = [];
    vi.stubGlobal("window", {
      dataLayer,
      location: { pathname: "/office" },
      __shaleanGa4Bootstrapped: false,
    });
    vi.stubGlobal("document", {
      querySelector: vi.fn(() => null),
      querySelectorAll: vi.fn(() => []),
      createElement: vi.fn(),
      head: { appendChild: vi.fn() },
    });

    const { ensureGa4Bootstrapped } = await import("@/components/analytics/Ga4RouteGuard");
    ensureGa4Bootstrapped();

    expect(window.__shaleanGa4Bootstrapped).toBe(false);
    const configs = dataLayer.filter((e) => Array.isArray(e) && e[0] === "config");
    expect(configs).toHaveLength(0);
  });
});

describe("PII sanitisation", () => {
  it("strips PII from GA params", () => {
    const safe = sanitizeGa4Params({
      service: "regular-cleaning",
      email: "a@b.com",
      phone: "+27821234567",
      customer_name: "Jane",
    });
    expect(safe.email).toBeUndefined();
    expect(safe.phone).toBeUndefined();
    expect(safe.customer_name).toBeUndefined();
    trackGa4Event("booking_start", { service: "regular-cleaning", email: "leak@example.com" });
  });
});
