import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BlogIndexPost } from "@/lib/blog/get-all-posts";
import {
  canonicalizeIndexableBlogSitemapSlug,
  collectFileBasedBlogSitemapRows,
  listCanonicalIndexableBlogHubArticleSlugs,
  unionBlogSitemapRows,
} from "@/lib/seo/blogSitemapUnion";
import { buildMarketingSitemapEntries } from "@/lib/seo/buildMarketingSitemapEntries";

const getAllPublishedPosts = vi.hoisted(() => vi.fn(async (): Promise<BlogIndexPost[]> => []));
const getPublishedBlogSitemapRows = vi.hoisted(() =>
  vi.fn(async (): Promise<{ slug: string; lastModified: Date }[]> => []),
);
const getPublishedBlogNoindexSitemapSlugs = vi.hoisted(() =>
  vi.fn(async (): Promise<string[]> => []),
);

vi.mock("@/lib/blog/get-all-posts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/blog/get-all-posts")>();
  return {
    ...actual,
    getAllPublishedPosts: () => getAllPublishedPosts(),
  };
});

vi.mock("@/lib/blog/get-post-by-slug", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/blog/get-post-by-slug")>();
  return {
    ...actual,
    getPublishedBlogSitemapRows: () => getPublishedBlogSitemapRows(),
    getPublishedBlogNoindexSitemapSlugs: () => getPublishedBlogNoindexSitemapSlugs(),
  };
});

function hubPost(partial: Partial<BlogIndexPost> & { slug: string }): BlogIndexPost {
  return {
    slug: partial.slug,
    title: partial.title ?? partial.slug,
    excerpt: partial.excerpt ?? "excerpt",
    image: partial.image ?? { src: "/images/x.webp", alt: "x" },
    readingTime: partial.readingTime ?? 5,
    publishedAt: partial.publishedAt ?? "2026-06-01T00:00:00.000Z",
    source: partial.source ?? "editorial",
    noindex: partial.noindex ?? false,
  };
}

describe("blogSitemapUnion", () => {
  beforeEach(() => {
    getAllPublishedPosts.mockReset();
    getPublishedBlogSitemapRows.mockReset();
    getPublishedBlogNoindexSitemapSlugs.mockReset();
    getAllPublishedPosts.mockResolvedValue([]);
    getPublishedBlogSitemapRows.mockResolvedValue([]);
    getPublishedBlogNoindexSitemapSlugs.mockResolvedValue([]);
  });

  it("dedupes canonical slugs and gives CMS lastmod precedence", () => {
    const cmsDate = new Date("2026-07-20T00:00:00.000Z");
    const fileDate = new Date("2026-01-01T00:00:00.000Z");
    const rows = unionBlogSitemapRows(
      [{ slug: "how-much-does-cleaning-cost-cape-town-2026", lastModified: cmsDate }],
      [
        { slug: "how-much-does-cleaning-cost-cape-town-2026", lastModified: fileDate },
        { slug: "same-day-cleaning-cape-town", lastModified: fileDate },
      ],
    );
    const bySlug = new Map(rows.map((r) => [r.slug, r]));
    expect(bySlug.get("how-much-does-cleaning-cost-cape-town-2026")).toMatchObject({
      source: "cms",
      lastModified: cmsDate,
    });
    expect(bySlug.get("same-day-cleaning-cape-town")?.source).toBe("file");
    expect(rows.length).toBe(2);
  });

  it("does not re-add a CMS noindex slug via file-based fill", async () => {
    getPublishedBlogSitemapRows.mockResolvedValue([]);
    getPublishedBlogNoindexSitemapSlugs.mockResolvedValue([
      "how-much-does-cleaning-cost-cape-town-2026",
    ]);
    getAllPublishedPosts.mockResolvedValue([
      hubPost({ slug: "how-much-does-cleaning-cost-cape-town-2026", noindex: true }),
    ]);

    const fileDate = new Date("2026-01-01T00:00:00.000Z");
    const pure = unionBlogSitemapRows(
      [],
      [{ slug: "how-much-does-cleaning-cost-cape-town-2026", lastModified: fileDate }],
      { suppressCanonicalSlugs: ["how-much-does-cleaning-cost-cape-town-2026"] },
    );
    expect(pure.some((r) => r.slug === "how-much-does-cleaning-cost-cape-town-2026")).toBe(false);

    const entries = await buildMarketingSitemapEntries();
    const paths = entries.map((e) => new URL(e.url).pathname);
    expect(paths).not.toContain("/blog/how-much-does-cleaning-cost-cape-town-2026");
  });

  it("excludes redirect-alias slugs from the union", () => {
    const rows = unionBlogSitemapRows(
      [{ slug: "cleaning-prices-cape-town-guide", lastModified: new Date("2026-07-01T00:00:00.000Z") }],
      [{ slug: "deep-vs-standard-cleaning-cape-town", lastModified: new Date("2026-07-01T00:00:00.000Z") }],
    );
    expect(rows.every((r) => r.slug !== "cleaning-prices-cape-town-guide")).toBe(true);
    expect(rows.every((r) => r.slug !== "deep-vs-standard-cleaning-cape-town")).toBe(true);
    expect(canonicalizeIndexableBlogSitemapSlug("cleaning-prices-cape-town-guide")).toBeNull();
  });

  it("lists file-based indexable articles when CMS is empty", () => {
    const fileRows = collectFileBasedBlogSitemapRows();
    expect(fileRows.length).toBeGreaterThan(10);
    expect(fileRows.some((r) => r.slug === "how-much-does-cleaning-cost-cape-town-2026")).toBe(true);
  });

  it("includes every canonical indexable hub-linked article in the sitemap", async () => {
    getAllPublishedPosts.mockResolvedValue([
      hubPost({ slug: "how-much-does-cleaning-cost-cape-town-2026", noindex: false }),
      hubPost({ slug: "move-out-cleaning-checklist-cape-town", noindex: false }),
      hubPost({
        slug: "hub-only-indexable-article",
        noindex: false,
        publishedAt: "2026-07-15T00:00:00.000Z",
      }),
      hubPost({ slug: "secret-draft-style", noindex: true }),
      hubPost({ slug: "deep-vs-standard-cleaning-cape-town", noindex: false }),
    ]);
    getPublishedBlogSitemapRows.mockResolvedValue([
      {
        slug: "how-much-does-cleaning-cost-cape-town-2026",
        lastModified: new Date("2026-07-21T00:00:00.000Z"),
      },
      {
        slug: "move-out-cleaning-checklist-cape-town",
        lastModified: new Date("2026-07-21T00:00:00.000Z"),
      },
    ]);

    const hubSlugs = await listCanonicalIndexableBlogHubArticleSlugs();
    expect(hubSlugs).toContain("how-much-does-cleaning-cost-cape-town-2026");
    expect(hubSlugs).toContain("move-out-cleaning-checklist-cape-town");
    expect(hubSlugs).toContain("hub-only-indexable-article");
    expect(hubSlugs).not.toContain("secret-draft-style");
    expect(hubSlugs).not.toContain("deep-vs-standard-cleaning-cape-town");

    const entries = await buildMarketingSitemapEntries();
    const paths = new Set(entries.map((e) => new URL(e.url).pathname.replace(/\/+$/, "") || "/"));
    for (const slug of hubSlugs) {
      expect(paths.has(`/blog/${slug}`)).toBe(true);
    }
    expect(paths.has("/blog/hub-only-indexable-article")).toBe(true);
    expect(paths.has("/blog/secret-draft-style")).toBe(false);
  });

  it("keeps file-based articles in the sitemap union when CMS is unavailable", async () => {
    getPublishedBlogSitemapRows.mockRejectedValue(new Error("supabase down"));
    const entries = await buildMarketingSitemapEntries();
    const paths = entries.map((e) => new URL(e.url).pathname);
    expect(paths.some((p) => p.startsWith("/blog/"))).toBe(true);
    expect(paths).toContain("/blog/how-much-does-cleaning-cost-cape-town-2026");
  });
});
