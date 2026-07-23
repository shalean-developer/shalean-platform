import { describe, expect, it } from "vitest";
import {
  blogPostSelfCanonical,
  buildStaticBlogMetadataFallback,
  ensureBlogPostSelfCanonical,
  metadataHasCanonical,
} from "@/lib/blog/seo/blogPostCanonicalMetadata";
import { getHighConversionBlogPost, ROUTED_HIGH_CONVERSION_POSTS } from "@/lib/blog/highConversionPosts";
import { getProgrammaticPost, ROUTED_PROGRAMMATIC_POSTS } from "@/lib/blog/programmaticPosts";
import { getAirbnbHostGuidePost, AIRBNB_HOST_GUIDE_POSTS } from "@/lib/blog/airbnbHostGuidePosts";
import { HOME_CANONICAL } from "@/lib/seo/homePageMeta";
import { SITE_ORIGIN } from "@/lib/site/canonical";
import { SEO_INDEX_FOLLOW } from "@/lib/site/seoRobots";
import type { Metadata } from "next";

const FLOOR_GUIDE_SLUG = "floor-cleaning-care-guide";

describe("blogPostCanonicalMetadata — self-referencing canonicals", () => {
  it("builds exactly one HTTPS apex self-canonical for floor-cleaning-care-guide", () => {
    const canonical = blogPostSelfCanonical(FLOOR_GUIDE_SLUG);
    expect(canonical).toBe("https://shalean.co.za/blog/floor-cleaning-care-guide");
    expect(canonical.startsWith("https://")).toBe(true);
    expect(canonical).toContain("shalean.co.za");
    expect(canonical).not.toContain("www.");
    expect(canonical).not.toContain("?");
    expect(canonical).not.toBe(HOME_CANONICAL);
    expect(SITE_ORIGIN).toBe("https://shalean.co.za");
  });

  it("ignores query-string-like input and path noise when deriving the canonical", () => {
    // Callers must pass the route slug only; preview/utm query params never enter this helper.
    expect(blogPostSelfCanonical(FLOOR_GUIDE_SLUG)).toBe(
      blogPostSelfCanonical(` ${FLOOR_GUIDE_SLUG} `),
    );
    expect(blogPostSelfCanonical(`/blog/${FLOOR_GUIDE_SLUG}`)).toBe(
      "https://shalean.co.za/blog/floor-cleaning-care-guide",
    );
    expect(blogPostSelfCanonical(FLOOR_GUIDE_SLUG)).not.toMatch(/[?&]=/);
  });

  it("fallback metadata always emits a self-canonical (never homepage, never omitted)", () => {
    const meta = buildStaticBlogMetadataFallback(FLOOR_GUIDE_SLUG);
    expect(meta.alternates?.canonical).toBe(
      "https://shalean.co.za/blog/floor-cleaning-care-guide",
    );
    expect(meta.alternates?.canonical).not.toBe(HOME_CANONICAL);
    expect(meta.alternates?.canonical).not.toBeUndefined();
    expect(meta.openGraph && "url" in meta.openGraph ? meta.openGraph.url : undefined).toBe(
      "https://shalean.co.za/blog/floor-cleaning-care-guide",
    );
    expect(meta.robots).toEqual(SEO_INDEX_FOLLOW);

    // Count: a single canonical string on alternates (no array / no duplicate keys).
    const canonicalField = meta.alternates?.canonical;
    expect(typeof canonicalField).toBe("string");
    expect(Array.isArray(canonicalField)).toBe(false);
  });

  it("ensureBlogPostSelfCanonical fills missing canonical without duplicating an existing one", () => {
    const bare: Metadata = {
      title: "Bare",
      description: "x",
      robots: SEO_INDEX_FOLLOW,
    };
    const filled = ensureBlogPostSelfCanonical(bare, FLOOR_GUIDE_SLUG);
    expect(filled.alternates?.canonical).toBe(
      "https://shalean.co.za/blog/floor-cleaning-care-guide",
    );
    expect(metadataHasCanonical(filled)).toBe(true);

    const existing = "https://shalean.co.za/blog/floor-cleaning-care-guide";
    const withCanon: Metadata = {
      title: "Has canon",
      alternates: { canonical: existing },
    };
    const unchanged = ensureBlogPostSelfCanonical(withCanon, FLOOR_GUIDE_SLUG);
    expect(unchanged.alternates?.canonical).toBe(existing);
    // Still exactly one canonical string — not an array of conflicting values.
    expect(unchanged.alternates?.canonical).toBe(existing);
  });

  it("does not let empty slug fall back to the homepage canonical", () => {
    const meta = buildStaticBlogMetadataFallback("");
    expect(meta.alternates?.canonical).toBe("https://shalean.co.za/blog");
    expect(meta.alternates?.canonical).not.toBe(HOME_CANONICAL);
  });
});

describe("blogPostCanonicalMetadata — other blog rendering paths not regressed", () => {
  it("high-conversion posts keep self-referencing /blog/{slug} canonicals", () => {
    expect(ROUTED_HIGH_CONVERSION_POSTS.length).toBeGreaterThan(0);
    for (const post of ROUTED_HIGH_CONVERSION_POSTS.slice(0, 8)) {
      const resolved = getHighConversionBlogPost(post.slug);
      expect(resolved?.slug).toBe(post.slug);
      expect(blogPostSelfCanonical(post.slug)).toBe(`https://shalean.co.za/blog/${post.slug}`);
      expect(blogPostSelfCanonical(post.slug)).not.toBe(HOME_CANONICAL);
    }
  });

  it("programmatic posts keep self-referencing /blog/{slug} canonicals", () => {
    expect(ROUTED_PROGRAMMATIC_POSTS.length).toBeGreaterThan(0);
    for (const post of ROUTED_PROGRAMMATIC_POSTS.slice(0, 8)) {
      const resolved = getProgrammaticPost(post.slug);
      expect(resolved?.slug).toBe(post.slug);
      expect(blogPostSelfCanonical(post.slug)).toBe(`https://shalean.co.za/blog/${post.slug}`);
      expect(blogPostSelfCanonical(post.slug)).not.toBe(HOME_CANONICAL);
    }
  });

  it("airbnb host-guide posts keep self-referencing /blog/{slug} canonicals", () => {
    expect(AIRBNB_HOST_GUIDE_POSTS.length).toBeGreaterThan(0);
    for (const post of AIRBNB_HOST_GUIDE_POSTS.slice(0, 8)) {
      const resolved = getAirbnbHostGuidePost(post.slug);
      expect(resolved?.slug).toBe(post.slug);
      expect(blogPostSelfCanonical(post.slug)).toBe(`https://shalean.co.za/blog/${post.slug}`);
      expect(blogPostSelfCanonical(post.slug)).not.toBe(HOME_CANONICAL);
    }
  });

  it("preview/utm query parameters must not alter the derived canonical", () => {
    const base = blogPostSelfCanonical(FLOOR_GUIDE_SLUG);
    // Simulate what generateMetadata receives: slug from params, query in searchParams only.
    const previewSearchParams = { preview: "true", utm_source: "ci", utm_medium: "test" };
    void previewSearchParams;
    expect(blogPostSelfCanonical(FLOOR_GUIDE_SLUG)).toBe(base);
    expect(base).toBe("https://shalean.co.za/blog/floor-cleaning-care-guide");
    expect(base).not.toContain("preview");
    expect(base).not.toContain("utm_");
  });
});
