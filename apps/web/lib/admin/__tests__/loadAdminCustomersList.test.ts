import { describe, expect, it } from "vitest";

import { isExcludedStaffCustomer } from "@/lib/admin/loadAdminCustomersList";

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
