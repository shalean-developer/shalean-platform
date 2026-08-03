import { describe, expect, it } from "vitest";
import { permissionForOfficePath } from "@/lib/admin/routePermissions";

describe("permissionForOfficePath", () => {
  it.each([
    ["/office/payouts", "payout.view"],
    ["/office/payouts/batches/123", "payout.view"],
    ["/office/cash-flow", "finance.full.view"],
    ["/office/booking-profitability", "profit.view"],
    ["/office/security/permissions", "role.manage"],
    ["/office/pricing/services", "pricing.manage"],
  ])("maps %s to %s", (path, permission) => {
    expect(permissionForOfficePath(path)).toBe(permission);
  });

  it("does not invent a permission for an unregistered route", () => {
    expect(permissionForOfficePath("/office/bookings")).toBeNull();
  });
});
