import { describe, expect, it } from "vitest";

import {
  deriveCustomerListStatus,
  isExcludedStaffCustomer,
  resolveCustomerTotalBookings,
} from "@/lib/admin/loadAdminCustomersList";

describe("deriveCustomerListStatus", () => {
  const now = Date.parse("2026-06-24T12:00:00Z");

  it("marks customers with an active recurring plan as active", () => {
    expect(
      deriveCustomerListStatus({
        lastBookingAt: null,
        hasActiveRecurringPlan: true,
        nowMs: now,
      }),
    ).toBe("active");
  });

  it("marks recent booking activity as active", () => {
    expect(
      deriveCustomerListStatus({
        lastBookingAt: "2026-06-01T10:00:00Z",
        hasActiveRecurringPlan: false,
        nowMs: now,
      }),
    ).toBe("active");
  });

  it("marks stale customers without recurring as inactive", () => {
    expect(
      deriveCustomerListStatus({
        lastBookingAt: "2025-01-01T10:00:00Z",
        hasActiveRecurringPlan: false,
        nowMs: now,
      }),
    ).toBe("inactive");
  });
});

describe("resolveCustomerTotalBookings", () => {
  it("uses the higher of profile and actual booking counts", () => {
    expect(resolveCustomerTotalBookings(0, 4)).toBe(4);
    expect(resolveCustomerTotalBookings(6, 4)).toBe(6);
  });
});

describe("isExcludedStaffCustomer", () => {
  const cleanerIds = new Set(["cleaner-uuid"]);

  it("excludes admin and cleaner roles", () => {
    expect(
      isExcludedStaffCustomer({
        userId: "x",
        role: "admin",
        loginEmail: "ops@example.com",
        cleanerAuthUserIds: cleanerIds,
      }),
    ).toBe(true);
    expect(
      isExcludedStaffCustomer({
        userId: "x",
        role: "cleaner",
        loginEmail: null,
        cleanerAuthUserIds: cleanerIds,
      }),
    ).toBe(true);
  });

  it("excludes users linked to cleaners table", () => {
    expect(
      isExcludedStaffCustomer({
        userId: "cleaner-uuid",
        role: null,
        loginEmail: "27691445709@cleaner.shalean.com",
        cleanerAuthUserIds: cleanerIds,
      }),
    ).toBe(true);
  });

  it("includes regular customers", () => {
    expect(
      isExcludedStaffCustomer({
        userId: "customer-uuid",
        role: "customer",
        loginEmail: "mongezib@arcfyre.com",
        cleanerAuthUserIds: cleanerIds,
      }),
    ).toBe(false);
    expect(
      isExcludedStaffCustomer({
        userId: "walkin-uuid",
        role: null,
        loginEmail: "27824103968@walkin.shalean.com",
        cleanerAuthUserIds: cleanerIds,
      }),
    ).toBe(false);
  });
});
