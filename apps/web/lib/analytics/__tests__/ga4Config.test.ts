import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import {
  GA4_BRANCH,
  GA4_CANONICAL_MEASUREMENT_ID,
  GA4_LEGACY_MEASUREMENT_IDS,
  getGa4MeasurementId,
  isGa4PathExcluded,
} from "@/lib/analytics/ga4Config";
import { ga4ParamsContainPii, sanitizeGa4Params } from "@/lib/analytics/ga4Pii";
import { GA4_FUNNEL_EVENTS } from "@/lib/analytics/ga4Events";

describe("ga4Config", () => {
  const env = process.env;

  beforeEach(() => {
    process.env = { ...env };
    delete process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
    delete process.env.GA4_MEASUREMENT_ID;
  });

  afterEach(() => {
    process.env = env;
  });

  it("defaults to the canonical apex Measurement ID", () => {
    expect(getGa4MeasurementId()).toBe(GA4_CANONICAL_MEASUREMENT_ID);
    expect(GA4_CANONICAL_MEASUREMENT_ID).toBe("G-GEVTBDWTQW");
  });

  it("ignores legacy www-linked Measurement IDs from env", () => {
    process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID = GA4_LEGACY_MEASUREMENT_IDS[0];
    expect(getGa4MeasurementId()).toBe(GA4_CANONICAL_MEASUREMENT_ID);
  });

  it("allows a non-legacy override (e.g. staging test stream)", () => {
    process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID = "G-STAGINGTEST1";
    expect(getGa4MeasurementId()).toBe("G-STAGINGTEST1");
  });

  it("excludes office, cleaner, and jobs paths", () => {
    expect(isGa4PathExcluded("/office")).toBe(true);
    expect(isGa4PathExcluded("/office/bookings")).toBe(true);
    expect(isGa4PathExcluded("/cleaner")).toBe(true);
    expect(isGa4PathExcluded("/cleaner/jobs/1")).toBe(true);
    expect(isGa4PathExcluded("/jobs")).toBe(true);
    expect(isGa4PathExcluded("/jobs/apply")).toBe(true);
    expect(isGa4PathExcluded("/book")).toBe(false);
    expect(isGa4PathExcluded("/")).toBe(false);
    expect(isGa4PathExcluded("/account/success")).toBe(false);
    expect(isGa4PathExcluded("/office-supplies")).toBe(false);
  });

  it("exports cape-town branch constant", () => {
    expect(GA4_BRANCH).toBe("cape-town");
  });
});

describe("sanitizeGa4Params", () => {
  it("strips email, phone, name, address, and notes keys", () => {
    const safe = sanitizeGa4Params({
      service: "regular-cleaning",
      branch: "cape-town",
      value: 450,
      email: "customer@example.com",
      phone: "+27821234567",
      customer_name: "Jane Doe",
      street_address: "12 Main Rd",
      booking_notes: "Please use the side gate",
      gclid: "abc",
    });
    expect(safe).toEqual({
      service: "regular-cleaning",
      branch: "cape-town",
      value: 450,
      gclid: "abc",
    });
    expect(ga4ParamsContainPii(safe)).toBe(false);
  });

  it("drops string values that look like email or phone even under benign keys", () => {
    const safe = sanitizeGa4Params({
      label: "customer@example.com",
      ref: "082 123 4567",
      ok: "regular-cleaning",
    });
    expect(safe.label).toBeUndefined();
    expect(safe.ref).toBeUndefined();
    expect(safe.ok).toBe("regular-cleaning");
  });
});

describe("GA4 funnel event names", () => {
  it("matches the required booking funnel contract", () => {
    expect(GA4_FUNNEL_EVENTS).toMatchObject({
      BOOKING_START: "booking_start",
      SERVICE_SELECTED: "service_selected",
      SCHEDULE_SELECTED: "schedule_selected",
      BOOKING_REVIEW: "booking_review",
      BEGIN_CHECKOUT: "begin_checkout",
      PURCHASE: "purchase",
      BOOKING_SUBMITTED: "booking_submitted",
      PHONE_CLICK: "phone_click",
      WHATSAPP_CLICK: "whatsapp_click",
    });
  });
});

describe("GoogleAnalytics bootstrap source", () => {
  it("embeds path exclusion and canonical measurement id", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const src = await fs.readFile(
      path.join(process.cwd(), "components/analytics/GoogleAnalytics.tsx"),
      "utf8",
    );
    expect(src).toContain("GA4_PATH_EXCLUSION_SNIPPET");
    expect(src).toContain("getGa4MeasurementId");
    expect(src).not.toContain("G-6JR2GPGPN3");
  });
});
