import { describe, expect, it } from "vitest";
import { validateCmsBlogDocument, validateCmsBlogLinksForAdminSave } from "./cms-blog-link-validation";
import { validateBlogPublish } from "./seo/publish-validation";
import { sanitizeBlogRichHtml } from "./sanitize-blog-html";
import { findUnsupportedBlogImages } from "./blog-image-validation";
import type { BlogContentJson } from "./content-json";
import type { SupabaseClient } from "@supabase/supabase-js";

describe("blog publish regressions", () => {
  it("uses only live/due rows for CMS-only link targets", async () => {
    const filters: [string,unknown][]=[];
    const query = { select: () => query, eq: (key:string,value:unknown) => { filters.push([key,value]); return query; },
      lte: (key:string,value:unknown) => { filters.push([key,value]); return query; },
      not: async () => ({ data: [{ slug: "live-cms-only" }], error: null }) };
    const admin = { from: () => query } as unknown as SupabaseClient;
    const errors = await validateCmsBlogLinksForAdminSave(admin, { slug:"source", status:"published", content:{schema_version:1,blocks:[{type:"internal_links",links:[{label:"Draft",url:"/blog/draft-cms-only"},{label:"Live",url:"/blog/live-cms-only"}]}]} });
    expect(filters).toContainEqual(["status","published"]);
    expect(filters.some(([key])=>key==="published_at")).toBe(true);
    expect(errors.map(e=>e.brokenHref)).toEqual(["/blog/draft-cms-only"]);
  });
  it("recommends the commercial destination instead of repeating a retired blog URL", () => {
    const errors=validateCmsBlogDocument({slug:"source",content:{schema_version:1,blocks:[{type:"internal_links",links:[{label:"Claremont",url:"/blog/cleaning-services-claremont-cape-town"}]}]}},new Set());
    expect(errors[0].recommendedFix).toContain("/locations/claremont-cleaning-services");
    expect(errors[0].recommendedFix).not.toContain("target /blog/cleaning-services-claremont-cape-town");
  });
  it("rejects malformed/nonself canonicals and keeps external citations valid", () => {
    for (const canonical_url of ["javascript:alert(1)","/services","https://shalean.co.za/blog/other"]) {
      expect(validateCmsBlogDocument({slug:"source",canonical_url,content:{schema_version:1,blocks:[]}},new Set())[0].issueType).toBe("bad-canonical");
    }
    expect(validateCmsBlogDocument({slug:"source",content:{schema_version:1,blocks:[{type:"rich_text",html:'<p><a href="https://example.org/blog/research">Research</a></p>'}]}},new Set())).toEqual([]);
  });
  it("renders a single page H1 and validates the same image policy used for display", () => {
    expect(sanitizeBlogRichHtml('<h1 id="authored">Body heading</h1>')).toBe('<h2 id="authored">Body heading</h2>');
    const content: BlogContentJson={schema_version:1,blocks:[{type:"rich_text",html:'<img src="https://unsupported.example/hero.jpg" alt="Photo">'}]};
    expect(findUnsupportedBlogImages(content)).toEqual(["https://unsupported.example/hero.jpg"]);
  });
  it("requires visible editorial depth while the public template supplies the shared booking CTA", () => {
    const content: BlogContentJson={schema_version:1,blocks:[{type:"rich_text",html:`<h2>Guide</h2><p>${"Useful cleaning advice. ".repeat(280)}</p>`},{type:"faq",items:[{question:"How?",answer:"Use a checklist."}]},{type:"internal_links",links:[{label:"Service",url:"/services/standard-cleaning-cape-town"}]}]};
    expect(validateBlogPublish(content).ok).toBe(true);
    const hidden: BlogContentJson={...content,blocks:[{type:"rich_text",html:`<h2>Guide</h2><script>${"Hidden words ".repeat(1000)}</script>`},...content.blocks.slice(1)]};
    expect(validateBlogPublish(hidden).issues.some(i=>i.code==="min_words")).toBe(true);
  });
});
