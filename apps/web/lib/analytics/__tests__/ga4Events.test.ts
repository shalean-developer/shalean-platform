import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

describe("trackGa4Event client helpers", () => {
  const env = process.env;

  beforeEach(() => {
    process.env = { ...env };
    delete process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
    vi.resetModules();
    // jsdom-like window
    const gtag = vi.fn();
    const dataLayer: unknown[] = [];
    vi.stubGlobal("window", {
      location: { pathname: "/book/regular-cleaning" },
      dataLayer,
      gtag,
    });
  });

  afterEach(() => {
    process.env = env;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("sends funnel events with branch and send_to canonical id", async () => {
    const { trackGa4BookingStart, trackGa4ServiceSelected } = await import("@/lib/analytics/ga4Events");
    const { GA4_CANONICAL_MEASUREMENT_ID } = await import("@/lib/analytics/ga4Config");

    trackGa4BookingStart({ service: "regular-cleaning", value: 420 });
    trackGa4ServiceSelected({ service: "regular-cleaning", value: 420 });

    const gtag = (window as unknown as { gtag: ReturnType<typeof vi.fn> }).gtag;
    expect(gtag).toHaveBeenCalled();
    const first = gtag.mock.calls[0];
    expect(first?.[0]).toBe("event");
    expect(first?.[1]).toBe("booking_start");
    expect(first?.[2]).toMatchObject({
      send_to: GA4_CANONICAL_MEASUREMENT_ID,
      branch: "cape-town",
      service: "regular-cleaning",
      currency: "ZAR",
    });
  });

  it("no-ops on excluded paths", async () => {
    (window as unknown as { location: { pathname: string } }).location.pathname = "/office/dashboard";
    const { trackGa4PhoneClick } = await import("@/lib/analytics/ga4Events");
    trackGa4PhoneClick();
    const gtag = (window as unknown as { gtag: ReturnType<typeof vi.fn> }).gtag;
    expect(gtag).not.toHaveBeenCalled();
  });

  it("strips PII from event params before gtag", async () => {
    const { trackGa4Event } = await import("@/lib/analytics/ga4Events");
    trackGa4Event("custom_test", {
      service: "deep-cleaning",
      email: "leak@example.com",
      phone: "0821112233",
      notes: "side gate",
    });
    const gtag = (window as unknown as { gtag: ReturnType<typeof vi.fn> }).gtag;
    const params = gtag.mock.calls[0]?.[2] as Record<string, unknown>;
    expect(params.email).toBeUndefined();
    expect(params.phone).toBeUndefined();
    expect(params.notes).toBeUndefined();
    expect(params.service).toBe("deep-cleaning");
  });

  it("booking_submitted marks dedupe only after a successful send", async () => {
    const store = new Map<string, string>();
    vi.stubGlobal("window", {
      location: { pathname: "/office" },
      dataLayer: [] as unknown[],
      gtag: vi.fn(),
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => store.set(k, v),
        removeItem: (k: string) => store.delete(k),
        clear: () => store.clear(),
        key: () => null,
        length: 0,
      },
      sessionStorage: {
        getItem: () => null,
        setItem: () => undefined,
        removeItem: () => undefined,
        clear: () => undefined,
        key: () => null,
        length: 0,
      },
    });

    const { trackGa4BookingSubmitted } = await import("@/lib/analytics/ga4Events");
    const sent = trackGa4BookingSubmitted({
      bookingId: "55555555-5555-4555-8555-555555555555",
      service: "regular-cleaning",
    });
    expect(sent).toBe(false);
    expect(store.size).toBe(0);

    (window as unknown as { location: { pathname: string } }).location.pathname =
      "/account/success";
    const sentPublic = trackGa4BookingSubmitted({
      bookingId: "55555555-5555-4555-8555-555555555555",
      service: "regular-cleaning",
    });
    expect(sentPublic).toBe(true);
    expect(store.size).toBe(1);
  });

  it("booking_submitted still sends when storage throws SecurityError", async () => {
    const securityError = new DOMException("Access denied", "SecurityError");
    vi.stubGlobal("window", {
      location: { pathname: "/account/success" },
      dataLayer: [] as unknown[],
      gtag: vi.fn(),
      localStorage: {
        getItem: () => {
          throw securityError;
        },
        setItem: () => {
          throw securityError;
        },
        removeItem: () => {
          throw securityError;
        },
        clear: () => undefined,
        key: () => null,
        length: 0,
      },
      sessionStorage: {
        getItem: () => {
          throw securityError;
        },
        setItem: () => {
          throw securityError;
        },
        removeItem: () => {
          throw securityError;
        },
        clear: () => undefined,
        key: () => null,
        length: 0,
      },
    });

    const { trackGa4BookingSubmitted } = await import("@/lib/analytics/ga4Events");
    const gtag = (window as unknown as { gtag: ReturnType<typeof vi.fn> }).gtag;

    expect(
      trackGa4BookingSubmitted({
        bookingId: "66666666-6666-4666-8666-666666666666",
        service: "regular-cleaning",
      }),
    ).toBe(true);
    expect(gtag).toHaveBeenCalled();
  });
});
