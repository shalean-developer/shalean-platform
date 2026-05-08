import { describe, expect, it } from "vitest";
import { validateEditorialContentLinks } from "./editorialLinkValidation";

describe("validateEditorialContentLinks", () => {
  it("flags redirect-alias slugs in HTML", () => {
    const html = `<p><a href="/blog/deep-vs-standard-cleaning-cape-town">x</a></p>`;
    const r = validateEditorialContentLinks({ html }, {});
    expect(r.issues.some((i) => i.kind === "redirect_alias")).toBe(true);
  });

  it("auto-fix rewrites alias href when requested", () => {
    const html = `<a href="/blog/deep-vs-standard-cleaning-cape-town">x</a>`;
    const r = validateEditorialContentLinks({ html }, { autoFixLegacySlugs: true });
    expect(r.fixedHtml).toContain("/blog/deep-cleaning-vs-regular-cleaning-cape-town");
  });
});
