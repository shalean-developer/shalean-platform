import { describe, expect, it } from "vitest";
import { computePostAuthRedirect } from "@/lib/auth/postAuthRedirect";
import { safePostLoginRedirect } from "@/lib/auth/userRole";

describe("computePostAuthRedirect", () => {
  it("sends cleaners to /jobs by default", () => {
    expect(
      computePostAuthRedirect({
        role: "cleaner",
        redirect: "/account/bookings",
      }),
    ).toBe("/jobs");
  });

  it("honors customer intent on account surfaces for cleaners", () => {
    expect(
      computePostAuthRedirect({
        role: "cleaner",
        redirect: "/account/bookings",
        intent: "customer",
      }),
    ).toBe("/account/bookings");
  });

  it("sends cleaners to /jobs deep links", () => {
    expect(
      computePostAuthRedirect({
        role: "cleaner",
        redirect: "/jobs/list",
      }),
    ).toBe("/jobs/list");
  });

  it("blocks non-cleaner sessions from /jobs redirects", () => {
    expect(
      computePostAuthRedirect({
        role: "customer",
        redirect: "/jobs/list",
      }),
    ).toBe("/account");
  });

  it("defaults customer home for empty redirect", () => {
    expect(
      computePostAuthRedirect({
        role: "customer",
        redirect: "",
      }),
    ).toBe("/account");
  });

  it("sends admin to /office", () => {
    expect(
      computePostAuthRedirect({
        role: "admin",
        redirect: "/office/bookings",
      }),
    ).toBe("/office/bookings");
  });
});

describe("safePostLoginRedirect", () => {
  it("rejects legacy /admin and /cleaner paths", () => {
    expect(safePostLoginRedirect("/admin/bookings", "admin")).toBe("/office");
    expect(safePostLoginRedirect("/cleaner/dashboard", "cleaner")).toBe("/jobs");
  });
});
