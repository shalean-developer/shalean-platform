import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ContextualArticleLinks } from "@/components/blog/ContextualArticleLinks";
import { LocationHubBlogSection } from "@/components/seo/LocationHubBlogSection";

const edges = [
  ["/services/deep-cleaning-cape-town", "how-often-deep-clean-home-cape-town"],
  ["/services/deep-cleaning-cape-town", "cleaning-mistakes-that-make-your-home-dirtier-cape-town"],
  ["/services/standard-cleaning-cape-town", "weekly-cleaning-routine-busy-professionals-cape-town"],
  ["/services/standard-cleaning-cape-town", "is-it-worth-hiring-cleaner-cape-town"],
  ["/locations/sea-point-cleaning-services", "apartment-cleaning-tips-sea-point-cape-town"],
  ["/locations/newlands-cleaning-services", "standard-cleaning-newlands-cape-town"],
  ["/locations/observatory-cleaning-services", "standard-cleaning-observatory-cape-town"],
] as const;

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

describe("contextual paths to orphan articles", () => {
  it.each(edges)("renders a crawlable anchor from %s to %s", (parentPath, slug) => {
    const html = renderToStaticMarkup(React.createElement(ContextualArticleLinks, { parentPath }));
    expect(html).toContain(`href="/blog/${slug}"`);
    expect(html).not.toContain('rel="nofollow"');
    expect(html).not.toContain("read more");
  });

  it.each(["sea-point", "newlands", "observatory"])("keeps %s guide reachable when CMS cards are empty", (area) => {
    const html = renderToStaticMarkup(React.createElement(LocationHubBlogSection, {
      locationName: area, locationSlug: `${area}-cleaning-services`, cards: [],
    }));
    expect(html).toContain('/blog/');
    expect(html).not.toContain("<ul");
  });

  it("does not add unrelated links", () => {
    expect(renderToStaticMarkup(React.createElement(ContextualArticleLinks, { parentPath: "/services/office-cleaning-cape-town" }))).toBe("");
  });

  it("does not link to disabled programmatic routes", async () => {
    vi.stubEnv("NEXT_PUBLIC_LEGACY_PROGRAMMATIC_ROUTES", "false");
    vi.resetModules();
    const { getContextualArticleLinks } = await import("@/components/blog/ContextualArticleLinks");
    for (const area of ["sea-point", "newlands", "observatory"]) {
      expect(getContextualArticleLinks(`/locations/${area}-cleaning-services`)).toEqual([]);
    }
    expect(getContextualArticleLinks("/services/deep-cleaning-cape-town")).toHaveLength(2);
  });
});
