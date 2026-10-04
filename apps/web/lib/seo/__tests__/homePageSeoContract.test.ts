import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import StructuredData from "@/components/home/StructuredData";
import {
  HOME_CANONICAL,
  HOME_OG_IMAGE,
  HOME_OPEN_GRAPH,
  HOME_PAGE_H1,
  HOME_PAGE_HEADLINE,
  HOME_PAGE_META_DESCRIPTION,
  HOME_PAGE_TITLE,
} from "@/lib/seo/homePageMeta";
import { PRIMARY_LOCAL_BUSINESS_IMAGE } from "@/lib/seo/primaryLocalBusinessJsonLd";
import { SEO_REBUILD_SITEMAP_CORE_PATHS } from "@/lib/seo/seoRebuildPhase1";
import { SITE_ORIGIN } from "@/lib/site/canonical";
import { SEO_INDEX_FOLLOW } from "@/lib/site/seoRobots";

const WEB_ROOT = path.resolve(process.cwd());
const heroSource = readFileSync(
  path.join(WEB_ROOT, "components/marketing-home/sections/MarketingHomeHeroSection.tsx"),
  "utf8",
);

describe("homepage SEO contract", () => {
  it("keeps the primary Cape Town cleaning intent aligned across title, H1 and schema name", () => {
    expect(HOME_PAGE_H1).toBe("Cleaning Services Cape Town");
    expect(HOME_PAGE_TITLE.toLowerCase()).toContain(HOME_PAGE_H1.toLowerCase());
    expect(HOME_PAGE_HEADLINE.toLowerCase()).toContain(HOME_PAGE_H1.toLowerCase());
    expect(heroSource).toContain("{HOME_PAGE_H1}");
    expect(heroSource.match(/<h1\b/g)).toHaveLength(1);
    expect(HOME_PAGE_META_DESCRIPTION.toLowerCase()).toContain("cleaning services in cape town");
  });

  it("keeps the homepage indexable and present in the governed sitemap set", () => {
    expect(SEO_INDEX_FOLLOW).toEqual({ index: true, follow: true });
    expect(SEO_REBUILD_SITEMAP_CORE_PATHS.filter((pathName) => pathName === "/")).toHaveLength(1);
  });

  it("keeps the apex homepage canonical and matching Open Graph identity", () => {
    expect(HOME_CANONICAL).toBe(`${SITE_ORIGIN}/`);
    expect(HOME_OPEN_GRAPH.url).toBe(HOME_CANONICAL);
    expect(HOME_OPEN_GRAPH.title).toBe(HOME_PAGE_TITLE);
    expect(HOME_OPEN_GRAPH.description).toBe(HOME_PAGE_META_DESCRIPTION);
  });

  it("references existing dedicated homepage and social images", () => {
    expect(HOME_OG_IMAGE).toBe("/images/marketing/homepage-hero-cleaning-team-cape-town-og.webp");
    expect(existsSync(path.join(WEB_ROOT, "public", HOME_OG_IMAGE))).toBe(true);
    expect(PRIMARY_LOCAL_BUSINESS_IMAGE).toBe(
      `${SITE_ORIGIN}/images/marketing/homepage-hero-cleaning-team-cape-town.webp`,
    );
    expect(
      existsSync(
        path.join(WEB_ROOT, "public", new URL(PRIMARY_LOCAL_BUSINESS_IMAGE).pathname),
      ),
    ).toBe(true);
  });

  it("emits the aligned WebPage, LocalBusiness and service schema graph", () => {
    const element = StructuredData({ services: [], locations: [], faqs: [] });
    const json = element.props.dangerouslySetInnerHTML.__html as string;
    const payload = JSON.parse(json) as { "@graph": Array<Record<string, unknown>> };

    expect(payload["@graph"].some((node) => node["@type"] === "WebSite")).toBe(true);
    expect(
      payload["@graph"].some(
        (node) => node["@type"] === "WebPage" && node.name === HOME_PAGE_HEADLINE,
      ),
    ).toBe(true);
    expect(payload["@graph"].some((node) => node["@type"] === "LocalBusiness")).toBe(true);
    expect(payload["@graph"].some((node) => node["@type"] === "Service")).toBe(true);
  });
});
