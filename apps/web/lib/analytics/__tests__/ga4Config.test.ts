import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import {
  GA4_BRANCH,
  GA4_CANONICAL_MEASUREMENT_ID,
  GA4_LEGACY_MEASUREMENT_IDS,
  getGa4ConfigOptions,
  getGa4MeasurementId,
  isGa4MeasurementId,
  isGa4PathExcluded,
} from "@/lib/analytics/ga4Config";
import { ga4DisableTargetIds, gaDisableKey, setGa4Disabled } from "@/lib/analytics/ga4Events";
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

  it("rejects legacy Measurement IDs case-insensitively with whitespace", () => {
    process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID = " g-6jr2gpgpn3 ";
    expect(getGa4MeasurementId()).toBe(GA4_CANONICAL_MEASUREMENT_ID);
    process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID = "G-6jr2GpGpN3";
    expect(getGa4MeasurementId()).toBe(GA4_CANONICAL_MEASUREMENT_ID);
  });

  it("detects legacy Measurement IDs via isLegacyGa4MeasurementId", async () => {
    const { isLegacyGa4MeasurementId } = await import("@/lib/analytics/ga4Config");
    expect(isLegacyGa4MeasurementId("G-6JR2GPGPN3")).toBe(true);
    expect(isLegacyGa4MeasurementId(" g-6jr2gpgpn3 ")).toBe(true);
    expect(isLegacyGa4MeasurementId("G-STAGINGTEST1")).toBe(false);
  });

  it("allows a non-legacy override (e.g. staging test stream)", () => {
    process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID = "G-STAGINGTEST1";
    expect(getGa4MeasurementId()).toBe("G-STAGINGTEST1");
  });

  it("ignores server-only GA4_MEASUREMENT_ID for browser analytics", () => {
    process.env.GA4_MEASUREMENT_ID = "G-SERVERONLY01";
    process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID = "G-CLIENTVISIBLE";
    expect(getGa4MeasurementId()).toBe("G-CLIENTVISIBLE");
    delete process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
    expect(getGa4MeasurementId()).toBe(GA4_CANONICAL_MEASUREMENT_ID);
  });

  it("rejects invalid public measurement IDs and falls back to canonical", () => {
    process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID = "not-a-measurement-id";
    expect(getGa4MeasurementId()).toBe(GA4_CANONICAL_MEASUREMENT_ID);
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

  it("keeps public cleaner application paths eligible for GA4", () => {
    expect(isGa4PathExcluded("/cleaner/apply")).toBe(false);
    expect(isGa4PathExcluded("/cleaner/apply/form")).toBe(false);
    expect(isGa4PathExcluded("/cleaner/dashboard")).toBe(true);
  });

  it("exports cape-town branch constant", () => {
    expect(GA4_BRANCH).toBe("cape-town");
  });

  it("validates G-* measurement IDs", () => {
    expect(isGa4MeasurementId("G-GEVTBDWTQW")).toBe(true);
    expect(isGa4MeasurementId("G-STAGINGTEST1")).toBe(true);
    expect(isGa4MeasurementId("UA-123456-1")).toBe(false);
    expect(isGa4MeasurementId("")).toBe(false);
  });

  it("disable flags target the active public measurement ID", () => {
    process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID = "G-STAGINGTEST1";
    vi.stubGlobal("window", { location: { pathname: "/" } });
    setGa4Disabled(true);
    const flags = window as unknown as Record<string, boolean>;
    expect(flags[gaDisableKey("G-STAGINGTEST1")]).toBe(true);
    expect(flags[gaDisableKey(GA4_CANONICAL_MEASUREMENT_ID)]).toBe(true);
    expect(flags[gaDisableKey(GA4_LEGACY_MEASUREMENT_IDS[0])]).toBe(true);
    expect(ga4DisableTargetIds()).toEqual(
      expect.arrayContaining(["G-STAGINGTEST1", GA4_CANONICAL_MEASUREMENT_ID, ...GA4_LEGACY_MEASUREMENT_IDS]),
    );
    vi.unstubAllGlobals();
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
    const guardSrc = await fs.readFile(
      path.join(process.cwd(), "components/analytics/Ga4RouteGuard.tsx"),
      "utf8",
    );
    expect(src).toContain("GA4_PATH_EXCLUSION_SNIPPET");
    expect(src).toContain("getGa4MeasurementId");
    expect(guardSrc).toContain("getGa4ConfigOptions");
    expect(guardSrc).toContain("getGa4MeasurementId");
    expect(src).not.toContain("G-6JR2GPGPN3");
    expect(src).not.toContain("GA4_MEASUREMENT_ID");
  });

  it("path exclusion snippet allows /cleaner/apply", async () => {
    const { GA4_PATH_EXCLUSION_SNIPPET } = await import("@/lib/analytics/ga4Config");
    expect(GA4_PATH_EXCLUSION_SNIPPET).toContain("cleaner\\/apply");
  });
});
