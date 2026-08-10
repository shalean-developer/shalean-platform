import { describe, expect, it } from "vitest";
import { evaluateGscVerificationReadiness } from "@/lib/seo/search-console-readiness";

describe("Search Console readiness", () => {
  it("accepts an HTML verification token", () => {
    expect(
      evaluateGscVerificationReadiness({
        baseUrl: "https://shalean.co.za",
        htmlVerificationToken: "token",
      }),
    ).toEqual({ ok: true, method: "html", reason: null });
  });

  it("accepts the matching DNS domain property", () => {
    expect(
      evaluateGscVerificationReadiness({
        baseUrl: "https://shalean.co.za",
        htmlVerificationToken: null,
        verificationMethod: "dns",
        siteUrl: "sc-domain:shalean.co.za",
      }),
    ).toEqual({ ok: true, method: "dns", reason: null });
  });

  it("rejects DNS verification when the property is missing", () => {
    const result = evaluateGscVerificationReadiness({
      baseUrl: "https://shalean.co.za",
      htmlVerificationToken: null,
      verificationMethod: "dns",
      siteUrl: null,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/GSC_SITE_URL is required/i);
  });

  it("rejects a DNS property for the wrong hostname", () => {
    const result = evaluateGscVerificationReadiness({
      baseUrl: "https://shalean.co.za",
      htmlVerificationToken: null,
      verificationMethod: "dns",
      siteUrl: "sc-domain:example.com",
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/sc-domain:shalean\.co\.za/i);
  });

  it("rejects missing verification configuration", () => {
    const result = evaluateGscVerificationReadiness({
      baseUrl: "https://shalean.co.za",
      htmlVerificationToken: null,
    });
    expect(result.ok).toBe(false);
  });
});
