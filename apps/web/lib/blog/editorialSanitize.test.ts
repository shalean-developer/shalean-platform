import { describe, expect, it } from "vitest";
import { sanitizeEditorialHref, sanitizeEditorialHtml, sanitizeEditorialMarkdown } from "./editorialSanitize";

describe("editorialSanitize", () => {
  it("sanitizeEditorialHref resolves legacy deep-vs slug chain", () => {
    expect(sanitizeEditorialHref("/blog/deep-vs-standard-cleaning-cape-town")).toBe(
      "/blog/deep-cleaning-vs-regular-cleaning-cape-town",
    );
  });

  it("sanitizeEditorialHref preserves mailto and bare hashes", () => {
    expect(sanitizeEditorialHref("mailto:a@b.co")).toBe("mailto:a@b.co");
    expect(sanitizeEditorialHref("#faqs")).toBe("#faqs");
  });

  it("sanitizeEditorialHtml rewrites anchor hrefs", () => {
    const html = `<p><a href="/blog/deep-vs-standard-cleaning-cape-town">x</a></p>`;
    expect(sanitizeEditorialHtml(html)).toContain("/blog/deep-cleaning-vs-regular-cleaning-cape-town");
  });

  it("sanitizeEditorialMarkdown rewrites markdown links", () => {
    const md = `See [compare](/blog/deep-vs-standard-cleaning-cape-town) for detail.`;
    expect(sanitizeEditorialMarkdown(md)).toContain("/blog/deep-cleaning-vs-regular-cleaning-cape-town");
  });
});
