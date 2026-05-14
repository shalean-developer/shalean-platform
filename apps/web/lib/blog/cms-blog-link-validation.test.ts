import { describe, expect, it } from "vitest";
import { CANONICAL_DEEP_VS_STANDARD_BLOG_HREF } from "@/lib/blog/canonicalEditorialBlogLinks";
import { BLOG_CONTENT_JSON_SCHEMA_VERSION, type BlogContentJson } from "@/lib/blog/content-json";
import {
  extractInternalBlogHrefsFromContentJson,
  parseInternalBlogHref,
  validateCmsBlogDocument,
  validateInternalBlogLinkTarget,
  suggestNormalizedBlogHref,
} from "@/lib/blog/cms-blog-link-validation";

describe("parseInternalBlogHref", () => {
  it("ignores non-blog and external sites without /blog/", () => {
    expect(parseInternalBlogHref("/locations/foo")).toEqual({ kind: "not_blog_internal" });
    expect(parseInternalBlogHref("https://example.com/page")).toEqual({ kind: "not_blog_internal" });
  });

  it("flags external host when path contains /blog/", () => {
    const r = parseInternalBlogHref("https://evil.com/blog/some-slug");
    expect(r.kind).toBe("external_host");
    if (r.kind === "external_host") expect(r.host).toBe("evil.com");
  });

  it("parses relative /blog slugs", () => {
    const r = parseInternalBlogHref("/blog/move-out-cleaning-checklist-cape-town");
    expect(r.kind).toBe("blog_path");
    if (r.kind === "blog_path") expect(r.initialSlug).toBe("move-out-cleaning-checklist-cape-town");
  });

  it("parses apex and www shalean hosts", () => {
    const r = parseInternalBlogHref("https://www.shalean.co.za/blog/deep-cleaning-vs-regular-cleaning-cape-town/");
    expect(r.kind).toBe("blog_path");
    if (r.kind === "blog_path") expect(r.initialSlug).toBe("deep-cleaning-vs-regular-cleaning-cape-town");
  });
});

describe("validateInternalBlogLinkTarget", () => {
  const empty = new Set<string>();
  const published = new Set(["only-in-db"]);

  it("accepts static editorial slugs with empty DB set", () => {
    const slug = "deep-cleaning-vs-regular-cleaning-cape-town";
    expect(validateInternalBlogLinkTarget(slug, { publishedSlugSet: empty })).toEqual({ ok: true });
  });

  it("accepts DB-only slugs when present in published set", () => {
    expect(validateInternalBlogLinkTarget("only-in-db", { publishedSlugSet: published })).toEqual({ ok: true });
  });

  it("rejects unknown slugs", () => {
    expect(validateInternalBlogLinkTarget("zzz-no-such-blog-slug-zzz", { publishedSlugSet: empty }).ok).toBe(false);
  });

  it("rejects redirect alias slugs", () => {
    const v = validateInternalBlogLinkTarget("move-out-cleaning-checklist-cape-town-renters", {
      publishedSlugSet: empty,
    });
    expect(v).toEqual({ ok: false, issueType: "redirect-alias" });
  });

  it("allows self-link even if slug not yet published", () => {
    expect(
      validateInternalBlogLinkTarget("new-draft-slug", {
        publishedSlugSet: empty,
        currentSlug: "new-draft-slug",
      }),
    ).toEqual({ ok: true });
  });
});

describe("extractInternalBlogHrefsFromContentJson", () => {
  it("collects hrefs from rich_text, cta, internal_links, and markdown", () => {
    const content: BlogContentJson = {
      schema_version: BLOG_CONTENT_JSON_SCHEMA_VERSION,
      blocks: [
        { type: "rich_text", html: '<p><a href="/blog/deep-cleaning-vs-regular-cleaning-cape-town">x</a></p>' },
        {
          type: "cta",
          title: "T",
          button_text: "Go",
          link: "https://shalean.co.za/blog/only-in-db",
        },
        {
          type: "internal_links",
          title: "More",
          links: [{ label: "L", url: "/blog/zzz-no-such-blog-slug-zzz" }],
        },
        {
          type: "paragraph",
          content: "See [guide](/blog/move-out-cleaning-checklist-cape-town-renters) here.",
        },
      ],
    };
    const occ = extractInternalBlogHrefsFromContentJson(content);
    const hrefs = occ.map((o) => o.rawHref);
    expect(hrefs).toContain("/blog/deep-cleaning-vs-regular-cleaning-cape-town");
    expect(hrefs).toContain("https://shalean.co.za/blog/only-in-db");
    expect(hrefs).toContain("/blog/zzz-no-such-blog-slug-zzz");
    expect(hrefs).toContain("/blog/move-out-cleaning-checklist-cape-town-renters");
  });
});

describe("validateCmsBlogDocument", () => {
  it("returns redirect-alias for direct link to redirect-only slug", () => {
    const content: BlogContentJson = {
      schema_version: BLOG_CONTENT_JSON_SCHEMA_VERSION,
      blocks: [
        {
          type: "paragraph",
          content: "[x](https://www.shalean.co.za/blog/move-out-cleaning-checklist-cape-town-renters)",
        },
      ],
    };
    const broken = validateCmsBlogDocument(
      { slug: "source-post", content, canonical_url: null, related_guide_override_slugs: null },
      new Set(),
    );
    expect(broken.some((b) => b.issueType === "redirect-alias")).toBe(true);
  });

  it("flags bad canonical pointing at missing slug", () => {
    const content: BlogContentJson = { schema_version: BLOG_CONTENT_JSON_SCHEMA_VERSION, blocks: [] };
    const broken = validateCmsBlogDocument(
      {
        slug: "my-post",
        content,
        canonical_url: "/blog/does-not-exist-12345",
        related_guide_override_slugs: null,
      },
      new Set(),
    );
    expect(broken.some((b) => b.fieldPath === "canonical_url" && b.issueType === "bad-canonical")).toBe(true);
  });

  it("passes when canonical matches editorial route", () => {
    const content: BlogContentJson = { schema_version: BLOG_CONTENT_JSON_SCHEMA_VERSION, blocks: [] };
    const broken = validateCmsBlogDocument(
      {
        slug: "my-post",
        content,
        canonical_url: `https://shalean.co.za${CANONICAL_DEEP_VS_STANDARD_BLOG_HREF}`,
        related_guide_override_slugs: null,
      },
      new Set(),
    );
    expect(broken.filter((b) => b.fieldPath === "canonical_url")).toEqual([]);
  });
});

describe("suggestNormalizedBlogHref", () => {
  it("rewrites www shalean absolute URL toward normalized path form", () => {
    const s = suggestNormalizedBlogHref("https://www.shalean.co.za/blog/deep-cleaning-vs-regular-cleaning-cape-town/");
    expect(s.startsWith("/blog/deep-cleaning-vs-regular-cleaning-cape-town")).toBe(true);
  });
});
