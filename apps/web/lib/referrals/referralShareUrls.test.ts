import { describe, expect, it } from "vitest";
import {
  facebookSharerHref,
  isLocalReferralOrigin,
  toPublicReferralShareUrl,
  whatsAppShareHref,
} from "./referralShareUrls";

describe("referral share URLs", () => {
  it("detects localhost referral origins", () => {
    expect(isLocalReferralOrigin("http://localhost:3000")).toBe(true);
    expect(isLocalReferralOrigin("http://127.0.0.1:3000")).toBe(true);
    expect(isLocalReferralOrigin("https://shalean.co.za")).toBe(false);
  });

  it("rewrites localhost referral links to the public site while preserving attribution", () => {
    expect(toPublicReferralShareUrl("http://localhost:3000/refer?ref=ABC123")).toBe(
      "https://shalean.co.za/refer?ref=ABC123",
    );
  });

  it("keeps already-public referral links unchanged", () => {
    const url = "https://shalean.co.za/refer?ref=ABC123";
    expect(toPublicReferralShareUrl(url)).toBe(url);
  });

  it("builds Facebook sharing with the public referral URL", () => {
    const href = facebookSharerHref("http://localhost:3000/refer?ref=ABC123");
    expect(href).toBe(
      `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent("https://shalean.co.za/refer?ref=ABC123")}`,
    );
  });

  it("encodes WhatsApp referral messages", () => {
    const message = "Try Shalean https://shalean.co.za/refer?ref=ABC123";
    expect(whatsAppShareHref(message)).toBe(`https://wa.me/?text=${encodeURIComponent(message)}`);
  });
});
