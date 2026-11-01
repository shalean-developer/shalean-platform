import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import BlogIndexPage from "@/app/blog/page";

vi.mock("@/components/marketing-home/MarketingLayout", () => ({
  default: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children),
}));
vi.mock("@/lib/blog/get-all-posts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/blog/get-all-posts")>();
  const slugs = [
    "how-much-does-cleaning-cost-cape-town-2026", "deep-cleaning-vs-regular-cleaning",
    "move-out-cleaning-checklist-cape-town", "airbnb-cleaning-checklist-cape-town",
    "how-often-book-home-cleaning-cape-town", "weekly-cleaning-routine-busy-professionals-cape-town",
    "is-it-worth-hiring-cleaner-cape-town", "cleaning-mistakes-that-make-your-home-dirtier-cape-town",
    "standard-cleaning-newlands-cape-town", "standard-cleaning-observatory-cape-town",
  ];
  return { ...actual, getAllPublishedPosts: async () => slugs.map(slug => ({
    slug, title: slug, excerpt: "A cleaning guide", image: { src: "/images/marketing/deep-cleaning-cape-town-kitchen.webp", alt: "Cleaning guide" },
    readingTime: 4, publishedAt: "2026-04-01T09:00:00+02:00", source: "high_conversion", noindex: false,
  })) };
});

describe("blog index image loading", () => {
  it("defers all card images while retaining the featured image preload", async () => {
    const html = renderToStaticMarkup(await BlogIndexPage({ searchParams: Promise.resolve({}) }));
    const images = html.match(/<img\b[^>]*>/g) ?? [];
    expect(images.length).toBeGreaterThan(5);
    const cards = images.filter(tag => /blog-card|group-hover/.test(tag));
    expect(cards.length).toBeGreaterThan(4);
    expect(cards.every(tag => tag.includes('loading="lazy"'))).toBe(true);
    expect(images.filter(tag => tag.includes('loading="eager"'))).toHaveLength(0);
    expect(html).toMatch(/<link[^>]+rel="preload"[^>]+as="image"/);
    expect(html).toContain("Featured");
    expect(html).toContain('href="/blog/standard-cleaning-newlands-cape-town"');
  });
});
