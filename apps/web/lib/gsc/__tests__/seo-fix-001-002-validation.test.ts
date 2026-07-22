import { describe, expect, it } from "vitest";
import {
  assertScopedSeoFix001002Url,
  assertSeoFix001002ConfirmPhrase,
  decideSitemapSubmit,
  isAuthorizedSeoFix001002SiteUrl,
  isWeeklyInspectWindowOpen,
  SEO_FIX_001_002_CONFIRM_PHRASE,
  SEO_FIX_001_002_PRODUCTION_DEPLOYED_AT,
  SEO_FIX_001_002_REMEDIATED_URLS,
  SEO_FIX_001_002_SITEMAP_FEED,
  SEO_FIX_001_002_WEEKLY_INSPECT_END,
  SEO_FIX_001_002_WEEKLY_INSPECT_START,
} from "@/lib/gsc/seo-fix-001-002-validation";

describe("seo-fix-001-002-validation guards", () => {
  it("accepts only the confirmation phrase", () => {
    expect(() => assertSeoFix001002ConfirmPhrase(SEO_FIX_001_002_CONFIRM_PHRASE)).not.toThrow();
    expect(() => assertSeoFix001002ConfirmPhrase("nope")).toThrow(/confirmation phrase/);
  });

  it("authorizes only shalean.co.za GSC property identifiers", () => {
    expect(isAuthorizedSeoFix001002SiteUrl("sc-domain:shalean.co.za")).toBe(true);
    expect(isAuthorizedSeoFix001002SiteUrl("https://shalean.co.za")).toBe(true);
    expect(isAuthorizedSeoFix001002SiteUrl("https://shalean.co.za/")).toBe(true);
    expect(isAuthorizedSeoFix001002SiteUrl("https://example.com")).toBe(false);
    expect(isAuthorizedSeoFix001002SiteUrl("sc-domain:example.com")).toBe(false);
  });

  it("scopes URLs to the five services + sitemap only", () => {
    for (const url of SEO_FIX_001_002_REMEDIATED_URLS) {
      expect(() => assertScopedSeoFix001002Url(url)).not.toThrow();
    }
    expect(() => assertScopedSeoFix001002Url(SEO_FIX_001_002_SITEMAP_FEED)).not.toThrow();
    expect(() =>
      assertScopedSeoFix001002Url("https://shalean.co.za/services/standard-cleaning-cape-town"),
    ).toThrow(/out-of-scope/);
  });

  it("skips sitemap submit when lastSubmitted is on/after production deploy", () => {
    const skip = decideSitemapSubmit({
      lastSubmitted: "2026-07-22T16:00:00.000Z",
      productionDeployedAt: SEO_FIX_001_002_PRODUCTION_DEPLOYED_AT,
    });
    expect(skip.shouldSubmit).toBe(false);

    const submit = decideSitemapSubmit({
      lastSubmitted: "2026-07-20T10:00:00.000Z",
      productionDeployedAt: SEO_FIX_001_002_PRODUCTION_DEPLOYED_AT,
    });
    expect(submit.shouldSubmit).toBe(true);

    const missing = decideSitemapSubmit({ lastSubmitted: null });
    expect(missing.shouldSubmit).toBe(true);
  });

  it("opens weekly inspect window for eight runs ending 2026-09-16", () => {
    expect(SEO_FIX_001_002_WEEKLY_INSPECT_START).toBe("2026-07-29");
    expect(SEO_FIX_001_002_WEEKLY_INSPECT_END).toBe("2026-09-16");
    expect(isWeeklyInspectWindowOpen(new Date("2026-07-29T09:00:00Z"))).toBe(true);
    expect(isWeeklyInspectWindowOpen(new Date("2026-09-16T09:00:00Z"))).toBe(true);
    expect(isWeeklyInspectWindowOpen(new Date("2026-07-22T09:00:00Z"))).toBe(false);
    expect(isWeeklyInspectWindowOpen(new Date("2026-09-17T09:00:00Z"))).toBe(false);
  });
});
