import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PRIMARY_CAPE_TOWN_SERVICE_SLUGS,
  isPrimaryCapeTownServiceSlug,
} from "@/components/services/PrimaryCapeTownServicePageTemplate";
import {
  CAPE_TOWN_SERVICE_SEO,
  buildCapeTownServiceMetadata,
} from "@/lib/seo/capeTownSeoPages";
import { CAPE_TOWN_PRICING_AUTHORITY_HREF } from "@/lib/seo/internalLinks";
import { absoluteCanonicalUrl } from "@/lib/site/canonical";
import { SEO_INDEX_FOLLOW } from "@/lib/site/seoRobots";

const EXPECTED_ROUTES = [
  ["standard-cleaning-cape-town", "/services/standard-cleaning-cape-town"],
  ["deep-cleaning-cape-town", "/services/deep-cleaning-cape-town"],
  ["move-out-cleaning-cape-town", "/services/move-out-cleaning-cape-town"],
  ["airbnb-cleaning-cape-town", "/services/airbnb-cleaning-cape-town"],
  ["office-cleaning-cape-town", "/services/office-cleaning-cape-town"],
  ["carpet-cleaning-cape-town", "/services/carpet-cleaning-cape-town"],
] as const;

const readSource = (path: string) =>
  readFileSync(join(process.cwd(), path), "utf8");

describe("RD-PUBLIC-03G six-route contract", () => {
  it("keeps exactly the six governed services inside the shared template", () => {
    expect(PRIMARY_CAPE_TOWN_SERVICE_SLUGS).toEqual(
      EXPECTED_ROUTES.map(([slug]) => slug),
    );
    expect(isPrimaryCapeTownServiceSlug("window-cleaning-cape-town")).toBe(false);

    const route = readSource("app/services/[service]/page.tsx");
    expect(route).toContain("isPrimaryCapeTownServiceSlug(capeTownSeo.slug)");
    expect(route).toContain("<PrimaryCapeTownServicePageTemplate");
    expect(route).toContain("<SeoCapeTownServicePage");
  });

  it.each(EXPECTED_ROUTES)(
    "%s has governed metadata, H1, canonical, and FAQs",
    (slug, expectedPath) => {
      const page = CAPE_TOWN_SERVICE_SEO[slug];
      const metadata = buildCapeTownServiceMetadata(page);
      const canonical = absoluteCanonicalUrl(expectedPath);

      expect(page.path).toBe(expectedPath);
      expect(page.h1.trim().length).toBeGreaterThan(20);
      expect(page.faqs.length).toBeGreaterThanOrEqual(3);
      expect(page.faqs.every((faq) => faq.q.trim() && faq.a.trim())).toBe(true);
      expect(String(metadata.title)).toContain("Cape Town");
      expect(String(metadata.title)).toContain("Shalean");
      expect(String(metadata.title).length).toBeGreaterThan(30);
      expect(String(metadata.description).length).toBeGreaterThan(60);
      expect(metadata.robots).toEqual(SEO_INDEX_FOLLOW);
      expect(metadata.alternates?.canonical).toBe(canonical);
      expect(metadata.openGraph?.url).toBe(canonical);
    },
  );

  it("keeps route metadata, H1s, and canonicals unique", () => {
    const pages = EXPECTED_ROUTES.map(([slug]) => CAPE_TOWN_SERVICE_SEO[slug]);
    const metadata = pages.map((page) => buildCapeTownServiceMetadata(page));
    expect(new Set(pages.map((page) => page.title)).size).toBe(6);
    expect(new Set(pages.map((page) => page.h1)).size).toBe(6);
    expect(new Set(pages.map((page) => page.path)).size).toBe(6);
    expect(new Set(metadata.map((entry) => entry.title)).size).toBe(6);
    expect(new Set(metadata.map((entry) => entry.description)).size).toBe(6);
  });

  it("renders FAQ schema and governed internal-link surfaces", () => {
    const renderer = readSource("components/seo/SeoCapeTownServicePage.tsx");

    expect(renderer).toContain('"@type": "FAQPage"');
    expect(renderer).toContain("faqSchemaSource.map");
    expect(renderer).toContain("CAPE_TOWN_PRICING_AUTHORITY_HREF");
    expect(CAPE_TOWN_PRICING_AUTHORITY_HREF).toMatch(/^\//);
    expect(renderer).not.toContain("<SeoInternalLinksBlock");
    expect(renderer.match(/<RelatedLinks/g)).toHaveLength(1);
    expect(renderer).toContain("areasPillLinks.map");
  });

  it("keeps an accessible mobile booking CTA on every rendered service route", () => {
    const renderer = readSource("components/seo/SeoCapeTownServicePage.tsx");

    expect(renderer).toContain('className="fixed bottom-0 left-0 right-0');
    expect(renderer).toContain("md:hidden print:hidden");
    expect(renderer).toContain("env(safe-area-inset-bottom)");
    expect(renderer).toContain('source={`seo_ct_${slug}_sticky_book`}');
    expect(renderer).not.toContain('source={`seo_ct_${slug}_sticky_start`}');
    expect(renderer).toContain("min-h-12");
    expect(renderer).toContain("Book now");
  });
});
