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

  it.each(["carpet-cleaning", "move-out-cleaning", "window-cleaning"])(
    "links directly to the canonical %s service from CMS HTML and markdown",
    (service) => {
      const alias = `/services/${service}`;
      const canonical = `${alias}-cape-town`;
      expect(sanitizeEditorialHtml(`<p>See <a href="${alias}">our service</a>.</p>`)).toBe(
        `<p>See <a href="${canonical}">our service</a>.</p>`,
      );
      expect(sanitizeEditorialMarkdown(`See [our service](${alias}).`)).toBe(
        `See [our service](${canonical}).`,
      );
      expect(sanitizeEditorialHref(`https://www.shalean.co.za${alias}/?source=guide#scope`)).toBe(
        `${canonical}?source=guide#scope`,
      );
      expect(sanitizeEditorialHref(canonical)).toBe(canonical);
    },
  );

  it.each([
    "/services/carpet-cleaning-cape-town?source=guide#scope",
    "/services/carpet-cleaning-other-city",
    "/services/carpet-cleaning/unknown-child",
    "/book/carpet-cleaning?step=2",
    "/account/bookings",
    "/api/payment/webhook",
    "https://example.com/services/carpet-cleaning",
    "mailto:hello@shalean.co.za",
    "tel:+27871535250",
    "#scope",
  ])("preserves the unrelated or already-canonical link %s", (href) => {
    expect(sanitizeEditorialHref(href)).toBe(href);
  });
});
