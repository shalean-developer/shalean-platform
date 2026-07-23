import { describe, expect, it } from "vitest";
import {
  extractCanonicalHref,
  extractGoogleSiteVerificationToken,
  extractSameOriginLinks,
  isBrokenInternalLinkStatus,
  LIVE_SEO_CRAWL_USER_AGENT,
  LIVE_SEO_HTML_SCAN_CHARS,
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

  it("extractCanonicalHref finds early head canonical and ignores past-window streamed tags", () => {
    expect(LIVE_SEO_CRAWL_USER_AGENT).toBe("ShaleanLiveSeoCrawl/1.0");
    expect(LIVE_SEO_HTML_SCAN_CHARS).toBe(180_000);
    expect(
      extractCanonicalHref(
        `<link rel="canonical" href="https://shalean.co.za/blog/floor-cleaning-care-guide" />`,
      ),
    ).toBe("https://shalean.co.za/blog/floor-cleaning-care-guide");
    const late = `${"y".repeat(LIVE_SEO_HTML_SCAN_CHARS + 10)}<link rel="canonical" href="https://shalean.co.za/blog/x" />`;
    expect(extractCanonicalHref(late)).toBeNull();
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
