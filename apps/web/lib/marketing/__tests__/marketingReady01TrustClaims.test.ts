import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ABOUT_REVIEWS } from "@/lib/about/about-page-content";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("MARKETING-READY-01 trust and claims cleanup", () => {
  it("does not publish unsupported weekly-cleaning volume claims on the About surface", () => {
    const about = [
      read("lib/about/about-page-content.ts"),
      read("components/about/AboutPageView.tsx"),
    ].join("\n");

    expect(about).not.toMatch(/4,?500\+?/i);
    expect(about).not.toMatch(/thousands of homes cleaned every week/i);
    expect(about).not.toMatch(/homes cleaned weekly/i);
  });

  it("keeps featured About/reviews testimonials unique", () => {
    const keys = ABOUT_REVIEWS.map(
      (review) => `${review.author}|${review.suburb}|${review.quote}`,
    );
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("does not reintroduce malformed support email copy", () => {
    const publicSurfaces = [
      read("components/marketing-home/sections/MarketingHomeFooter.tsx"),
      read("app/(marketing)/contact/page.tsx"),
      read("components/reviews/ReviewsPageContent.tsx"),
      read("components/about/AboutPageView.tsx"),
      read("components/nav/SiteTopBar.tsx"),
    ].join("\n");

    expect(publicSurfaces).not.toContain("supportsupport@shalean.com");
  });

  it("uses the public business identity for visible opening-hours copy", () => {
    const topBar = read("components/nav/SiteTopBar.tsx");
    const help = read("app/(ui-redesign)/account/help/page.tsx");

    expect(topBar).toContain("PUBLIC_BUSINESS_HOURS_LABEL");
    expect(help).toContain("PUBLIC_BUSINESS_HOURS_LABEL");
    expect(topBar).not.toContain("8am – 6pm (Mon - Sat)");
    expect(help).not.toContain("Mon–Sat 8am–6pm");
  });

  it("does not promise a full deposit return in moving-cleaning catalog fallbacks", () => {
    const catalogSources = [
      read("../../supabase/seeds/booking_v2_catalog_config.json"),
      read("../../supabase/seed/reference/pricing.sql"),
      read("../../scripts/seed-dev.mjs"),
    ].join("\n");

    expect(catalogSources).not.toMatch(/full deposit return/i);
    expect(catalogSources).not.toMatch(/ensure .*deposit return/i);
  });
});
