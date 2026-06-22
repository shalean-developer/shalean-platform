import { describe, expect, it } from "vitest";
import { countSitemapLocs, validateSitemapResponse } from "@/lib/seo/sitemapUptimeCheck";

describe("sitemapUptimeCheck", () => {
  it("counts loc entries", () => {
    const xml = `<?xml version="1.0"?><urlset><url><loc>https://shalean.co.za/</loc></url></urlset>`;
    expect(countSitemapLocs(xml)).toBe(1);
  });

  it("accepts healthy sitemap", () => {
    const xml = `<?xml version="1.0"?><urlset><url><loc>https://shalean.co.za/</loc></url><url><loc>https://shalean.co.za/blog</loc></url></urlset>`;
    const r = validateSitemapResponse(200, xml, "https://shalean.co.za/sitemap.xml");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.urlCount).toBe(2);
  });

  it("rejects non-200", () => {
    const r = validateSitemapResponse(500, "", "https://shalean.co.za/sitemap.xml");
    expect(r.ok).toBe(false);
  });
});
