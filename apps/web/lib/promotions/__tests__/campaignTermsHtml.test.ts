import { describe, expect, it } from "vitest";
import { sanitizeCampaignTermsHtml } from "@/lib/promotions/campaignTermsHtml";

describe("sanitizeCampaignTermsHtml", () => {
  it("keeps normal formatted terms", () => {
    const out = sanitizeCampaignTermsHtml(
      "<p>Offer valid until <strong>Friday</strong>.</p><ul><li>Cape Town only</li></ul>",
    );
    expect(out).toContain("<p>");
    expect(out).toContain("<strong>Friday</strong>");
    expect(out).toContain("<li>Cape Town only</li>");
  });

  it("strips <script> tags and their payload", () => {
    const out = sanitizeCampaignTermsHtml('<p>Hi</p><script>alert("xss")</script>');
    expect(out).not.toContain("<script");
    expect(out).not.toContain("alert(");
    expect(out).toContain("<p>Hi</p>");
  });

  it("removes inline event handlers (onerror/onclick)", () => {
    const out = sanitizeCampaignTermsHtml('<img src=x onerror="alert(1)"><p onclick="steal()">x</p>');
    expect(out.toLowerCase()).not.toContain("onerror");
    expect(out.toLowerCase()).not.toContain("onclick");
    expect(out).not.toContain("<img");
  });

  it("drops javascript: URLs on links", () => {
    const out = sanitizeCampaignTermsHtml('<a href="javascript:alert(1)">click</a>');
    expect(out.toLowerCase()).not.toContain("javascript:");
  });

  it("drops mixed-case / obfuscated javascript URLs", () => {
    const out = sanitizeCampaignTermsHtml('<a href="JaVaScRiPt:alert(1)">x</a>');
    expect(out.toLowerCase()).not.toContain("javascript:");
  });

  it("rejects unsafe data: URLs", () => {
    const out = sanitizeCampaignTermsHtml('<a href="data:text/html;base64,PHNjcmlwdD4=">x</a>');
    expect(out.toLowerCase()).not.toContain("data:text/html");
  });

  it("keeps safe external links and adds safe rel/target", () => {
    const out = sanitizeCampaignTermsHtml('<a href="https://shalean.co.za/terms">Terms</a>');
    expect(out).toContain('href="https://shalean.co.za/terms"');
    expect(out).toContain("noopener");
    expect(out).toContain("noreferrer");
    expect(out).toContain('target="_blank"');
  });

  it("removes iframe / object / embed / svg", () => {
    const out = sanitizeCampaignTermsHtml(
      '<iframe src="https://evil"></iframe><object></object><embed><svg onload="alert(1)"></svg>',
    );
    expect(out).not.toContain("<iframe");
    expect(out).not.toContain("<object");
    expect(out).not.toContain("<embed");
    expect(out).not.toContain("<svg");
  });

  it("strips style attributes (CSS injection)", () => {
    const out = sanitizeCampaignTermsHtml('<p style="position:fixed;top:0">x</p>');
    expect(out).not.toContain("style=");
  });

  it("handles nested malformed HTML without throwing", () => {
    const out = sanitizeCampaignTermsHtml("<p><b>unclosed <i>tags <script>alert(1)</p>");
    expect(out).not.toContain("<script");
  });

  it("is idempotent on already-sanitized content", () => {
    const once = sanitizeCampaignTermsHtml("<p>Hello <strong>world</strong></p>");
    const twice = sanitizeCampaignTermsHtml(once);
    expect(twice).toBe(once);
  });

  it("returns empty string for null / empty input", () => {
    expect(sanitizeCampaignTermsHtml(null)).toBe("");
    expect(sanitizeCampaignTermsHtml(undefined)).toBe("");
    expect(sanitizeCampaignTermsHtml("")).toBe("");
  });
});
