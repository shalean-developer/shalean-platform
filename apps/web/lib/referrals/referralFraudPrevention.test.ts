import { describe, expect, it } from "vitest";
import { computeReferralFraudScore } from "@/lib/referrals/fraudScore";
import { isValidReferralCodeFormat, generateReferralCodeCandidate } from "@/lib/referrals/referralCode";
import {
  __resetReferralPublicAbuseBuckets,
  checkReferralValidateIpLimit,
  recordReferralValidateFailure,
} from "@/lib/rateLimit/referralPublicAbuseLimit";

describe("referralCode", () => {
  it("accepts legacy numeric codes", () => {
    expect(isValidReferralCodeFormat("SHALEAN1234")).toBe(true);
  });

  it("accepts new strong alphanumeric codes", () => {
    const code = generateReferralCodeCandidate();
    expect(isValidReferralCodeFormat(code)).toBe(true);
    expect(code.length).toBe("SHALEAN".length + 8);
  });

  it("rejects invalid formats", () => {
    expect(isValidReferralCodeFormat("FAKE")).toBe(false);
    expect(isValidReferralCodeFormat("SHALEAN")).toBe(false);
  });
});

describe("computeReferralFraudScore", () => {
  it("flags spike and duplicate fingerprint as critical", () => {
    const result = computeReferralFraudScore({
      spikeSuspected: true,
      duplicateFingerprintIdentities: 3,
    });
    expect(result.score).toBeGreaterThanOrEqual(70);
    expect(result.riskLevel).toBe("critical");
  });
});

describe("referralPublicAbuseLimit", () => {
  it("rate limits excessive validate failures", () => {
    __resetReferralPublicAbuseBuckets();
    const req = new Request("https://example.com/api/referrals/validate-checkout", {
      headers: { "x-forwarded-for": "203.0.113.55" },
    });
    for (let i = 0; i < 20; i++) {
      checkReferralValidateIpLimit(req);
    }
    const fail = recordReferralValidateFailure(req);
    expect(fail.allowed).toBe(true);
    for (let i = 0; i < 20; i++) {
      recordReferralValidateFailure(req);
    }
    const blocked = recordReferralValidateFailure(req);
    expect(blocked.allowed).toBe(false);
  });
});
