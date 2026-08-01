import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { ANALYTICS_EVENTS } from "@/lib/analytics/userEventRegistry";
import { GA4_FUNNEL_EVENTS } from "@/lib/analytics/ga4Events";

const securityError = new DOMException("Access denied", "SecurityError");

const throwingStorage = {
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
};

describe("bookingV2FunnelGa4Isolation", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal("window", {
      location: { pathname: "/book/regular-cleaning", search: "", href: "http://localhost/book/regular-cleaning" },
      localStorage: throwingStorage,
      sessionStorage: throwingStorage,
      dataLayer: [] as unknown[],
      gtag: vi.fn(),
      matchMedia: () => ({ matches: false }),
      innerWidth: 1280,
    });
    vi.stubGlobal("document", {
      referrer: "",
      cookie: "",
    });
    vi.stubGlobal("navigator", { sendBeacon: vi.fn(() => true) });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("step 1 still emits booking_start and service_selected when localStorage throws SecurityError", async () => {
    const trackGrowthEvent = vi.fn(() => {
      throw securityError;
    });
    const trackBookingAnalyticsEvent = vi.fn(() => {
      throw securityError;
    });

    vi.doMock("@/lib/growth/trackEvent", () => ({
      trackGrowthEvent,
      markRetargetingCandidate: vi.fn(),
    }));
    vi.doMock("@/lib/booking/bookingFlowAnalytics", () => ({
      trackBookingAnalyticsEvent,
    }));

    const { trackBookingV2Step1Ga4First } = await import("@/lib/analytics/bookingV2FunnelGa4Isolation");
    const gtag = (window as unknown as { gtag: ReturnType<typeof vi.fn> }).gtag;

    trackBookingV2Step1Ga4First(
      "regular-cleaning",
      { service: "regular-cleaning", service_type: "regular-cleaning", finalPrice: 420 },
      { suburb: "Sea Point" },
      { step: 1, service: "regular-cleaning", flow: "booking_v2" },
    );

    expect(gtag).toHaveBeenCalled();
    const events = gtag.mock.calls.map((call) => call[1]);
    expect(events).toContain(GA4_FUNNEL_EVENTS.BOOKING_START);
    expect(events).toContain(GA4_FUNNEL_EVENTS.SERVICE_SELECTED);
    expect(trackGrowthEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.START_BOOKING, expect.any(Object));
  });

  it("step 1 still emits booking_start and service_selected when sessionStorage throws SecurityError", async () => {
    const trackGrowthEvent = vi.fn(() => {
      throw securityError;
    });
    const trackBookingAnalyticsEvent = vi.fn(() => {
      throw securityError;
    });

    vi.doMock("@/lib/growth/trackEvent", () => ({
      trackGrowthEvent,
      markRetargetingCandidate: vi.fn(),
    }));
    vi.doMock("@/lib/booking/bookingFlowAnalytics", () => ({
      trackBookingAnalyticsEvent,
    }));

    const { trackBookingV2Step1Ga4First } = await import("@/lib/analytics/bookingV2FunnelGa4Isolation");
    const gtag = (window as unknown as { gtag: ReturnType<typeof vi.fn> }).gtag;

    trackBookingV2Step1Ga4First(
      "regular-cleaning",
      { service: "regular-cleaning", service_type: "regular-cleaning", finalPrice: 420 },
      { suburb: "Sea Point" },
      { step: 1, service: "regular-cleaning", flow: "booking_v2" },
    );

    expect(gtag).toHaveBeenCalled();
    const events = gtag.mock.calls.map((call) => call[1]);
    expect(events).toContain(GA4_FUNNEL_EVENTS.BOOKING_START);
    expect(events).toContain(GA4_FUNNEL_EVENTS.SERVICE_SELECTED);
  });

  it("step 4 still emits begin_checkout when booking analytics throws SecurityError", async () => {
    const trackBookingAnalyticsEvent = vi.fn(() => {
      throw securityError;
    });

    vi.doMock("@/lib/booking/bookingFlowAnalytics", () => ({
      trackBookingAnalyticsEvent,
    }));

    const { trackBookingV2Step4Ga4First } = await import("@/lib/analytics/bookingV2FunnelGa4Isolation");
    const gtag = (window as unknown as { gtag: ReturnType<typeof vi.fn> }).gtag;

    trackBookingV2Step4Ga4First(
      "regular-cleaning",
      { service: "regular-cleaning", service_type: "regular-cleaning", finalPrice: 420 },
      { suburb: "Sea Point" },
    );

    expect(gtag).toHaveBeenCalled();
    const events = gtag.mock.calls.map((call) => call[1]);
    expect(events).toContain(GA4_FUNNEL_EVENTS.BEGIN_CHECKOUT);
    expect(trackBookingAnalyticsEvent).toHaveBeenCalledWith(
      ANALYTICS_EVENTS.BOOKING_PAYMENT_STARTED,
      expect.any(Object),
      expect.any(Object),
    );
  });
});

describe("useBookingV2FunnelTelemetry GA4 ordering", () => {
  it("delegates step 1 and step 4 GA4-first helpers", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const telemetry = await fs.readFile(
      path.join(process.cwd(), "src/features/booking-v2/hooks/useBookingV2FunnelTelemetry.ts"),
      "utf8",
    );
    expect(telemetry).toContain("trackBookingV2Step1Ga4First");
    expect(telemetry).toContain("trackBookingV2Step4Ga4First");
    expect(telemetry).not.toMatch(/trackGrowthEvent[\s\S]{0,200}trackGa4BookingStart/);
    expect(telemetry).not.toMatch(/trackBookingAnalyticsEvent[\s\S]{0,200}trackGa4BeginCheckout/);
  });
});
