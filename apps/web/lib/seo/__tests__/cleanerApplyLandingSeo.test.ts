import { describe, expect, it } from "vitest";
import robots from "@/app/robots";
import { buildMarketingSitemapEntries } from "@/lib/seo/buildMarketingSitemapEntries";
import {
  CLEANER_APPLY_FORM_PATH,
  CLEANER_APPLY_LANDING_DESCRIPTION,
  CLEANER_APPLY_LANDING_PATH,
  CLEANER_APPLY_LANDING_ROBOTS_ALLOW,
  CLEANER_APPLY_LANDING_TITLE,
  buildCleanerApplyFormMetadata,
  buildCleanerApplyLandingMetadata,
  cleanerApplyFormCanonical,
  cleanerApplyLandingCanonical,
} from "@/lib/seo/cleanerApplyLandingSeo";
import {
  isPathDisallowedByRobots,
  pathMatchesRobotsPattern,
} from "@/lib/seo/robotsPathRules";
import {
  SEO_CLEANER_APPLY_LANDING_SITEMAP_PATH,
  seoRobotsAllowPaths,
  seoRobotsDisallowPaths,
} from "@/lib/seo/seoRebuildPhase1";
import { validateMarketingSitemapEntries } from "@/lib/seo/validateMarketingSitemapEntries";
import { SITE_ORIGIN } from "@/lib/site/canonical";
import { SEO_INDEX_FOLLOW, SEO_NOINDEX_FOLLOW } from "@/lib/site/seoRobots";
import { HOME_CANONICAL, HOME_OPEN_GRAPH } from "@/lib/seo/homePageMeta";

function productionRobotsRules() {
  const previous = process.env.SHALEAN_APP_ENV;
  process.env.SHALEAN_APP_ENV = "production";
  try {
    return robots();
  } finally {
    if (previous === undefined) delete process.env.SHALEAN_APP_ENV;
    else process.env.SHALEAN_APP_ENV = previous;
  }
}

describe("cleaner apply landing SEO exception", () => {
  it("keeps /cleaner/apply indexable with self-canonical and recruitment OG", () => {
    const meta = buildCleanerApplyLandingMetadata();
    expect(meta.robots).toEqual(SEO_INDEX_FOLLOW);
    expect(meta.alternates?.canonical).toBe("https://shalean.co.za/cleaner/apply");
    expect(meta.alternates?.canonical).toBe(cleanerApplyLandingCanonical());
    expect(meta.alternates?.canonical).not.toBe(HOME_CANONICAL);
    expect(meta.title).toBe(CLEANER_APPLY_LANDING_TITLE);
    expect(meta.description).toBe(CLEANER_APPLY_LANDING_DESCRIPTION);
    expect(meta.openGraph?.url).toBe("https://shalean.co.za/cleaner/apply");
    expect(meta.openGraph?.title).toBe(CLEANER_APPLY_LANDING_TITLE);
    expect(meta.openGraph?.description).toBe(CLEANER_APPLY_LANDING_DESCRIPTION);
    expect(meta.openGraph?.url).not.toBe(HOME_OPEN_GRAPH.url);
  });

  it("keeps /cleaner/apply/form noindex,follow without homepage canonical", () => {
    const meta = buildCleanerApplyFormMetadata();
    expect(meta.robots).toEqual(SEO_NOINDEX_FOLLOW);
    expect(meta.alternates?.canonical).toBe(cleanerApplyFormCanonical());
    expect(meta.alternates?.canonical).toBe("https://shalean.co.za/cleaner/apply/form");
    expect(meta.alternates?.canonical).not.toBe(HOME_CANONICAL);
  });

  it("includes /cleaner/apply exactly once in the sitemap and excludes the form", async () => {
    const entries = await buildMarketingSitemapEntries();
    const applyUrls = entries.filter((e) => e.url === `${SITE_ORIGIN}${CLEANER_APPLY_LANDING_PATH}`);
    expect(applyUrls).toHaveLength(1);
    expect(SEO_CLEANER_APPLY_LANDING_SITEMAP_PATH).toBe(CLEANER_APPLY_LANDING_PATH);

    const paths = entries.map((e) => new URL(e.url).pathname.replace(/\/+$/, "") || "/");
    expect(paths.filter((p) => p === CLEANER_APPLY_LANDING_PATH)).toHaveLength(1);
    expect(paths).not.toContain(CLEANER_APPLY_FORM_PATH);
    expect(paths).not.toContain("/cleaner/login");
    expect(paths).not.toContain("/cleaner/dashboard");
    expect(paths).not.toContain("/cleaner/jobs");
    expect(paths).not.toContain("/cleaner/earnings");
    expect(paths).not.toContain("/cleaner/profile");

    expect(validateMarketingSitemapEntries(entries)).toEqual([]);
  });

  it("emits the narrowest Google-compatible cleaner Allow exception in production robots", () => {
    const doc = productionRobotsRules();
    const rule = Array.isArray(doc.rules) ? doc.rules[0] : doc.rules;
    expect(rule).toBeTruthy();
    const allow = Array.isArray(rule!.allow) ? rule!.allow : [rule!.allow];
    const disallow = Array.isArray(rule!.disallow) ? rule!.disallow : [rule!.disallow];

    expect(allow).toContain("/");
    expect(allow).toContain(CLEANER_APPLY_LANDING_ROBOTS_ALLOW);
    expect(allow).not.toContain("/cleaner/apply");
    expect(allow).not.toContain("/cleaner/apply/");
    expect(disallow).toContain("/cleaner/");
    expect(disallow).not.toContain("/cleaner");
    expect(seoRobotsAllowPaths()).toEqual(["/", "/cleaner/apply$"]);
    expect(seoRobotsDisallowPaths()).toContain("/cleaner/");

    // Mirror Next.js MetadataRoute robots serialization (resolveRobots).
    const serialized = [
      "User-Agent: *",
      ...allow.filter(Boolean).map((item) => `Allow: ${item}`),
      ...disallow.filter(Boolean).map((item) => `Disallow: ${item}`),
    ].join("\n");
    expect(serialized).toContain("Allow: /cleaner/apply$");
    expect(serialized).toContain("Disallow: /cleaner/");
    expect(serialized).not.toContain("Allow: /cleaner/apply\n");
    expect(serialized).not.toMatch(/Allow: \/cleaner\/apply\/(?!\$)/);
  });

  it("does not allow /cleaner/apply/form through a broad prefix Allow rule", () => {
    const rules = {
      allow: seoRobotsAllowPaths(),
      disallow: seoRobotsDisallowPaths(),
    };

    expect(pathMatchesRobotsPattern(CLEANER_APPLY_LANDING_PATH, CLEANER_APPLY_LANDING_ROBOTS_ALLOW)).toBe(
      true,
    );
    expect(pathMatchesRobotsPattern(CLEANER_APPLY_FORM_PATH, CLEANER_APPLY_LANDING_ROBOTS_ALLOW)).toBe(
      false,
    );
    expect(pathMatchesRobotsPattern("/cleaner/apply/extra", CLEANER_APPLY_LANDING_ROBOTS_ALLOW)).toBe(
      false,
    );

    expect(isPathDisallowedByRobots(CLEANER_APPLY_LANDING_PATH, rules)).toBe(false);
    expect(isPathDisallowedByRobots(CLEANER_APPLY_FORM_PATH, rules)).toBe(true);
    expect(isPathDisallowedByRobots("/cleaner/login", rules)).toBe(true);
    expect(isPathDisallowedByRobots("/cleaner/dashboard", rules)).toBe(true);
    expect(isPathDisallowedByRobots("/cleaner/jobs", rules)).toBe(true);
    expect(isPathDisallowedByRobots("/cleaner/earnings", rules)).toBe(true);
    expect(isPathDisallowedByRobots("/cleaner/profile", rules)).toBe(true);
    expect(isPathDisallowedByRobots("/cleaner", rules)).toBe(true);
  });
});
