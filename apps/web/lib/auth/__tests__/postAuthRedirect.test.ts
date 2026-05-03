import { describe, expect, it } from "vitest";
import { computePostAuthRedirect } from "@/lib/auth/postAuthRedirect";

describe("computePostAuthRedirect", () => {
  it("sends cleaners to dashboard when no customer intent", () => {
    expect(
      computePostAuthRedirect({
        intent: null,
        isCleaner: true,
        redirect: "/dashboard/bookings",
      }),
    ).toBe("/cleaner/dashboard");
  });

  it("honors customer intent on customer surfaces for linked cleaners", () => {
    expect(
      computePostAuthRedirect({
        intent: "customer",
        isCleaner: true,
        redirect: "/track/abc",
      }),
    ).toBe("/track/abc");
  });

  it("sends linked cleaners to cleaner deep links", () => {
    expect(
      computePostAuthRedirect({
        intent: "customer",
        isCleaner: true,
        redirect: "/cleaner/dashboard",
      }),
    ).toBe("/cleaner/dashboard");
  });

  it("blocks non-cleaner sessions from cleaner redirects", () => {
    expect(
      computePostAuthRedirect({
        intent: "customer",
        isCleaner: false,
        redirect: "/cleaner/dashboard",
      }),
    ).toBe("/dashboard/bookings");
  });

  it("defaults customer home for empty redirect", () => {
    expect(
      computePostAuthRedirect({
        intent: "customer",
        isCleaner: false,
        redirect: "",
      }),
    ).toBe("/dashboard/bookings");
  });
});
