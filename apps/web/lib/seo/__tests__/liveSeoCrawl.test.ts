import { describe, expect, it } from "vitest";
import {
  extractGoogleSiteVerificationToken,
  extractSameOriginLinks,
  isBrokenInternalLinkStatus,
  normalizeUrlPath,
  shouldSkipLiveInternalLinkTarget,
} from "@/lib/seo/liveSeoCrawl";

describe("liveSeoCrawl", () => {
  it("extractSameOriginLinks keeps same-origin paths and drops external/mailto", () => {
    const html = `
      <a href="/services">Services</a>
      <a href="https://shalean.co.za/faq/">FAQ</a>
      <a href="https://example.com/x">External</a>
      <a href="mailto:hi@shalean.co.za">Mail</a>
      <a href="#section">Skip hash-only</a>
    `;
    const links = extractSameOriginLinks(html, "https://shalean.co.za/");
    expect(links).toContain("https://shalean.co.za/services");
    expect(links).toContain("https://shalean.co.za/faq");
    expect(links.some((l) => l.includes("example.com"))).toBe(false);
  });

  it("normalizeUrlPath strips trailing slash and hash", () => {
    expect(normalizeUrlPath("https://shalean.co.za/services/")).toBe("https://shalean.co.za/services");
    expect(normalizeUrlPath("https://shalean.co.za/#x")).toBe("https://shalean.co.za/");
  });

  it("extractGoogleSiteVerificationToken reads meta content", () => {
    const html = `<meta name="google-site-verification" content="abc123token" />`;
    expect(extractGoogleSiteVerificationToken(html)).toBe("abc123token");
  });

  it("shouldSkipLiveInternalLinkTarget skips auth and booking funnel paths", () => {
    expect(shouldSkipLiveInternalLinkTarget("/book/regular-cleaning")).toBe(true);
    expect(shouldSkipLiveInternalLinkTarget("/services")).toBe(false);
  });

  it("isBrokenInternalLinkStatus flags 404/410/5xx only", () => {
    expect(isBrokenInternalLinkStatus(404)).toBe(true);
    expect(isBrokenInternalLinkStatus(410)).toBe(true);
    expect(isBrokenInternalLinkStatus(301)).toBe(false);
    expect(isBrokenInternalLinkStatus(200)).toBe(false);
  });
});
