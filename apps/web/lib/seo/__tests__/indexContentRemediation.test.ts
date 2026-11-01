// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { createElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ProgrammaticBlogTemplate } from "@/components/blog/ProgrammaticBlogTemplate";
import { LocalGuideProgrammaticTemplate } from "@/components/blog/LocalGuideProgrammaticTemplate";
import { ServicePageCommercialIntentSection, SERVICE_DECISION_COPY } from "@/components/seo/ServicePageCommercialIntentSection";
import { CANONICAL_DEEP_VS_STANDARD_BLOG_HREF } from "@/lib/blog/canonicalEditorialBlogLinks";
import { HIGH_CONVERSION_POSTS } from "@/lib/blog/highConversionPosts";
import { PROGRAMMATIC_POSTS, getProgrammaticFaqEntities, getProgrammaticTableOfContents } from "@/lib/blog/programmaticPosts";
import { normalizeBlogHref, getBlogRouteOwnership, isRedirectAliasBlogSlug } from "@/lib/blog/validBlogRoutes";
import { programmaticBlogCleanupRedirects } from "@/lib/seo/programmaticBlogCleanupRedirects";

vi.mock("@/components/growth/GrowthCtaLink", () => ({
  GrowthCtaLink: ({ children, href }: { children: ReactNode; href: string }) => createElement("a", { href }, children),
}));
const oldComparison = "/blog/deep-cleaning-vs-regular-cleaning-cape-town";
const canonicalComparison = "/blog/deep-cleaning-vs-regular-cleaning";
const documentFor = (element: ReactElement) => new DOMParser().parseFromString(renderToStaticMarkup(element), "text/html");

describe("indexing and content remediation", () => {
  it("consolidates both comparison aliases directly onto the retained guide", () => {
    expect(CANONICAL_DEEP_VS_STANDARD_BLOG_HREF).toBe(canonicalComparison);
    for (const source of [oldComparison, "/blog/deep-vs-standard-cleaning-cape-town"]) {
      expect(programmaticBlogCleanupRedirects.find((r) => r.source === source)?.destination).toBe(canonicalComparison);
      expect(normalizeBlogHref(`${source}?from=guide#rooms`)).toBe(`${canonicalComparison}?from=guide#rooms`);
    }
    expect(programmaticBlogCleanupRedirects.some((r) => r.source === canonicalComparison)).toBe(false);
  });
  it("keeps a code-owned destination for staging without modifying the production CMS", () => {
    expect(HIGH_CONVERSION_POSTS.filter((p) => p.slug === canonicalComparison.slice(6))).toHaveLength(1);
    expect(HIGH_CONVERSION_POSTS.some((p) => p.slug === oldComparison.slice(6))).toBe(false);
    expect(getBlogRouteOwnership(oldComparison.slice(6))).toBe("REDIRECT_ALIAS");
    expect(isRedirectAliasBlogSlug(oldComparison.slice(6))).toBe(true);
    expect(isRedirectAliasBlogSlug(canonicalComparison.slice(6))).toBe(false);
  });
  it("aligns regular-cleaning supplies in visible copy and FAQ entities", () => {
    const post = PROGRAMMATIC_POSTS.find((p) => p.service === "standard")!;
    const faq = getProgrammaticFaqEntities(post).find((p) => /products and equipment/.test(p.question))!;
    expect(faq.answer).toContain("customer provides");
    expect(faq.answer).toContain("paid supplies option");
    const doc = documentFor(createElement(ProgrammaticBlogTemplate, { post }));
    expect(doc.body.textContent).toContain(faq.answer);
    expect(doc.body.textContent).not.toContain("professional visits are supplied");
    const airbnb = PROGRAMMATIC_POSTS.find((p) => p.service === "airbnb")!;
    const airbnbFaq = getProgrammaticFaqEntities(airbnb).find((p) => /products and equipment/.test(p.question))!;
    expect(airbnbFaq.answer).toContain("customers provide");
    expect(documentFor(createElement(ProgrammaticBlogTemplate, { post: airbnb })).body.textContent).toContain(airbnbFaq.answer);
  });
  it("uses service-specific preparation and matching table-of-contents anchors", () => {
    const headings = new Set<string>();
    for (const service of ["deep", "standard", "airbnb", "move-out", "carpet"] as const) {
      const post = PROGRAMMATIC_POSTS.find((p) => p.service === service)!;
      const doc = documentFor(createElement(ProgrammaticBlogTemplate, { post }));
      const heading = doc.getElementById("prog-why-pro")!;
      headings.add(heading.textContent!);
      expect(getProgrammaticTableOfContents(post).find((h) => h.id === heading.id)?.label).toBe(heading.textContent);
      expect(doc.body.textContent).not.toContain("homes that pick up coastal dust fast");
      expect(doc.body.textContent).not.toContain("booking CTAs");
    }
    expect(headings.size).toBe(5);
  });
  it("renders guide prose with service names instead of raw route strings", () => {
    for (const post of PROGRAMMATIC_POSTS.filter((p) => p.service === "local-guide")) {
      const doc = documentFor(createElement(LocalGuideProgrammaticTemplate, { post }));
      expect(doc.body.textContent).not.toContain("/services/");
      expect(doc.body.textContent).not.toContain("illustration pricing");
      expect(doc.body.textContent).not.toContain("Insured, vetted teams");
      expect(post.publishedAt).toBe("2026-04-01T09:00:00+02:00");
    }
  });
  it("keeps specialist decisions distinct and labels the pricing destination correctly", () => {
    const headings = new Set<string>();
    for (const slug of Object.keys(SERVICE_DECISION_COPY) as (keyof typeof SERVICE_DECISION_COPY)[]) {
      const doc = documentFor(createElement(ServicePageCommercialIntentSection, { slug }));
      headings.add(doc.querySelector("h2")!.textContent!);
      expect(doc.querySelector('a[href="/cleaning-prices-cape-town"]')?.textContent).toBe("Compare cleaning prices");
      expect(doc.querySelector(`a[href="${slug === "window-cleaning-cape-town" ? "/quote" : "/book"}"]`)).not.toBeNull();
      if (slug === "office-cleaning-cape-town") {
        expect(doc.body.textContent).toContain("sensitive equipment");
        expect(doc.body.textContent).not.toContain("core residential tiers");
      }
      if (slug === "carpet-cleaning-cape-town") expect(doc.body.textContent).toContain("drying guidance");
    }
    expect(headings.size).toBe(7);
  });
});
