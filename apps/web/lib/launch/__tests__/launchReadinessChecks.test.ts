import { describe, expect, it, vi, beforeEach } from "vitest";
import { isLaunchBookingReference } from "@/lib/launch/launchReadinessChecks";
import { auditMockDashboardData, OFFICE_PLACEHOLDER_PAGES } from "@/lib/launch/mockDataAudit";
import { buildLaunchCheckConfirmPayload } from "@/lib/launch/launchCheckSeed";
import { dashboardRouteForRole, safePostLoginRedirect } from "@/lib/auth/userRole";
import { isLaunchCheckEnabled } from "@/lib/launch/launchCheckConfig";

describe("isLaunchBookingReference", () => {
  it("accepts SHL-BK-###### references", () => {
    expect(isLaunchBookingReference("SHL-BK-000001")).toBe(true);
    expect(isLaunchBookingReference("shl-bk-123456")).toBe(true);
  });

  it("rejects Paystack and empty refs", () => {
    expect(isLaunchBookingReference("bv2_123")).toBe(false);
    expect(isLaunchBookingReference("")).toBe(false);
    expect(isLaunchBookingReference(null)).toBe(false);
  });
});

describe("buildLaunchCheckConfirmPayload", () => {
  it("builds a valid regular-cleaning once-off payload", () => {
    const payload = buildLaunchCheckConfirmPayload({ pricingTotal: 450 });
    expect(payload.serviceSlug).toBe("regular-cleaning");
    expect(payload.bookingType).toBe("once_off");
    expect(payload.pricingSummary.total).toBe(450);
    expect(/^\d{4}-\d{2}-\d{2}$/.test(payload.date)).toBe(true);
    expect(payload.contactPhone).toMatch(/^0\d{9}$/);
  });
});

describe("auditMockDashboardData", () => {
  it("lists placeholder office pages as warnings", () => {
    const audit = auditMockDashboardData();
    expect(audit.passed).toBe(true);
    expect(audit.details.placeholderCount).toBe(OFFICE_PLACEHOLDER_PAGES.length);
    expect(audit.details.coreDashboardApis).toContain("/api/customer/bookings");
  });
});

describe("role routing helpers", () => {
  it("maps roles to dashboard routes", () => {
    expect(dashboardRouteForRole("admin")).toBe("/office");
    expect(dashboardRouteForRole("cleaner")).toBe("/jobs");
    expect(dashboardRouteForRole("customer")).toBe("/account");
  });

  it("blocks cross-role redirects", () => {
    expect(safePostLoginRedirect("/office", "customer")).toBe("/account");
    expect(safePostLoginRedirect("/jobs", "customer")).toBe("/account");
    expect(safePostLoginRedirect("/account", "admin")).toBe("/office");
  });
});

describe("isLaunchCheckEnabled", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it("is enabled outside production by default", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("VERCEL_ENV", "");
    expect(isLaunchCheckEnabled()).toBe(true);
  });

  it("requires ENABLE_LAUNCH_CHECK on production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("ENABLE_LAUNCH_CHECK", "");
    expect(isLaunchCheckEnabled()).toBe(false);
    vi.stubEnv("ENABLE_LAUNCH_CHECK", "true");
    expect(isLaunchCheckEnabled()).toBe(true);
  });
});
