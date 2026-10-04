import { describe, expect, it } from "vitest";
import { buildReferralAuthHref } from "@/lib/referrals/referralInviteJourney";

describe("buildReferralAuthHref", () => {
  it("preserves the referral code through signup and returns the visitor to booking", () => {
    const href = buildReferralAuthHref("signup", "/book?ref=SHALEANMFT6WBXL");
    const url = new URL(href, "https://shalean.co.za");

    expect(url.pathname).toBe("/auth/signup");
    expect(url.searchParams.get("intent")).toBe("customer");
    expect(url.searchParams.get("redirect")).toBe("/book?ref=SHALEANMFT6WBXL");
  });

  it("builds the matching returning-customer sign-in path", () => {
    const href = buildReferralAuthHref("login", "/book?ref=SHALEANMFT6WBXL");
    const url = new URL(href, "https://shalean.co.za");

    expect(url.pathname).toBe("/auth/login");
    expect(url.searchParams.get("redirect")).toBe("/book?ref=SHALEANMFT6WBXL");
  });

  it("rejects an external redirect", () => {
    const href = buildReferralAuthHref("signup", "https://evil.example/steal");
    const url = new URL(href, "https://shalean.co.za");

    expect(url.searchParams.get("redirect")).toBe("/book");
  });
});
