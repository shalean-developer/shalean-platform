import { describe, expect, it } from "vitest";
import { referralCodeFromSearchParam } from "@/lib/referrals/referralLandingQuery";

describe("referralCodeFromSearchParam", () => {
  it("normalizes a referral code supplied by the server route", () => {
    expect(referralCodeFromSearchParam(" shaleanmft6wbxl ")).toBe("SHALEANMFT6WBXL");
  });

  it("uses the first value when the query parameter is repeated", () => {
    expect(referralCodeFromSearchParam(["SHALEANFIRST", "SHALEANSECOND"])).toBe("SHALEANFIRST");
  });

  it("returns null when no referral code is present", () => {
    expect(referralCodeFromSearchParam(undefined)).toBeNull();
    expect(referralCodeFromSearchParam("   ")).toBeNull();
  });
});
