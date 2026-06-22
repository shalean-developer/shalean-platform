import { describe, expect, it } from "vitest";
import {
  readMarketingSitemapLastModified,
  resolveProgrammaticBlogLastModified,
} from "@/lib/seo/sitemapLastModified";

describe("sitemapLastModified", () => {
  it("reads MARKETING_SITEMAP_LAST_MODIFIED when set", () => {
    const prev = process.env.MARKETING_SITEMAP_LAST_MODIFIED;
    process.env.MARKETING_SITEMAP_LAST_MODIFIED = "2026-06-22";
    expect(readMarketingSitemapLastModified().toISOString().slice(0, 10)).toBe("2026-06-22");
    if (prev === undefined) delete process.env.MARKETING_SITEMAP_LAST_MODIFIED;
    else process.env.MARKETING_SITEMAP_LAST_MODIFIED = prev;
  });

  it("resolves programmatic blog dates by canonical slug", () => {
    const d = resolveProgrammaticBlogLastModified("same-day-cleaning-cape-town");
    expect(d).toBeInstanceOf(Date);
    expect(Number.isNaN(d!.getTime())).toBe(false);
  });
});
