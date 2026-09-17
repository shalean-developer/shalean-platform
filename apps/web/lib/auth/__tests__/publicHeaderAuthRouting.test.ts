import { describe, expect, it } from "vitest";
import { safePostLoginRedirect } from "@/lib/auth/userRole";
import {
  publicHeaderAccountLabel,
  publicHeaderDashboardHref,
  publicHeaderPostAuthRedirect,
  publicHeaderShowsCustomerBookings,
} from "@/lib/auth/publicHeaderAuthRouting";

describe("public header authentication routing", () => {
  it.each([
    ["customer", "/account"],
    ["cleaner", "/jobs"],
    ["admin", "/office"],
  ] as const)("routes a signed-in %s to the canonical dashboard", (role, expected) => {
    expect(publicHeaderDashboardHref(role)).toBe(expected);
    expect(safePostLoginRedirect("/account", role)).toBe(expected);
  });

  it.each([
    ["customer", "My Account", true],
    ["cleaner", "Cleaner Workspace", false],
    ["admin", "Office Dashboard", false],
  ] as const)("renders the correct %s menu destinations", (role, label, showsBookings) => {
    expect(publicHeaderAccountLabel(role)).toBe(label);
    expect(publicHeaderShowsCustomerBookings(role)).toBe(showsBookings);
  });

  it("sends homepage login and signup through role-aware dashboard resolution", () => {
    expect(publicHeaderPostAuthRedirect("/", "")).toBe("/account");
    expect(publicHeaderPostAuthRedirect("/", "campaign=home")).toBe("/account");
  });

  it("preserves legitimate non-homepage redirect destinations", () => {
    expect(publicHeaderPostAuthRedirect("/services/deep-cleaning", "from=header")).toBe(
      "/services/deep-cleaning?from=header",
    );
  });

  it("uses the customer dashboard until a signed-in role has been cached", () => {
    expect(publicHeaderDashboardHref(null)).toBe("/account");
  });
});
