import { describe, expect, it } from "vitest";
import { buildReferrerDisplayLabel } from "@/lib/admin/referralsReadModelFormat";

describe("buildReferrerDisplayLabel", () => {
  it("prefers name and code", () => {
    expect(
      buildReferrerDisplayLabel({
        displayName: "Sarah M.",
        referralCode: "SHALEAN4821",
        emailOrPhone: "a@b.com",
        fallbackId: "00000000-0000-4000-8000-000000000001",
      }),
    ).toBe("Sarah M. (SHALEAN4821)");
  });

  it("falls back to truncated id", () => {
    expect(
      buildReferrerDisplayLabel({
        displayName: null,
        referralCode: null,
        emailOrPhone: null,
        fallbackId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      }),
    ).toBe("aaaaaaaa…");
  });
});
