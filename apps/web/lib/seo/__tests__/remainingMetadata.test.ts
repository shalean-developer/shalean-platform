import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SERVICE_CONFIG, SERVICE_SLUGS } from "@/src/features/booking-v2/config/serviceConfig";
import { CAPE_TOWN_LOCATIONS } from "@/lib/seo/capeTownLocations";
import { buildLocationPageMetaTitleForVariant } from "@/lib/seo/location-title-variants";
import { absoluteCanonicalUrl } from "@/lib/site/canonical";
import { metadata as bookMetadata } from "@/app/(ui-redesign)/book/layout";
import { metadata as loginMetadata } from "@/app/cleaner/login/layout";

vi.mock("@/src/features/booking-v2/BookingV2Shell", () => ({
  BookingV2Shell: ({ serviceSlug }: { serviceSlug: string }) => createElement("div", { "data-booking-service": serviceSlug }),
}));
import ServiceBookingPage, { generateMetadata } from "@/app/(ui-redesign)/book/[serviceSlug]/page";

const props = (serviceSlug: string, query: Record<string, string> = {}) => ({ params: Promise.resolve({ serviceSlug }), searchParams: Promise.resolve(query) });

describe("SEO-META-04 complete location titles", () => {
  it("preserves every place name in all three configured variants without literal clipping", () => {
    for (const row of CAPE_TOWN_LOCATIONS) {
      for (const variant of ["A", "B", "C"] as const) {
        const title = buildLocationPageMetaTitleForVariant(row, variant);
        expect(title, `${row.slug}/${variant}`).toContain(row.name);
        expect(title).not.toMatch(/…|\.\.\.$/);
      }
    }
  });
});

describe("SEO-META-05/06 transactional metadata", () => {
  it.each(SERVICE_SLUGS)("uses the %s route, title and description across all metadata", async (slug) => {
    const meta = await generateMetadata(props(slug));
    const title = `Book ${SERVICE_CONFIG[slug].label} in Cape Town | Shalean`;
    const description = SERVICE_CONFIG[slug].description;
    const url = absoluteCanonicalUrl(`/book/${slug}`);
    expect(meta.title).toBe(title);
    expect(meta.description).toBe(description);
    expect(meta.robots).toEqual({ index: false, follow: false });
    expect(meta.alternates?.canonical).toBe(url);
    expect(meta.openGraph).toMatchObject({ url, title, description });
    expect(meta.twitter).toMatchObject({ title, description });
  });
  it("gives the booking directory and cleaner login their own canonicals", () => {
    expect(bookMetadata.alternates?.canonical).toBe(absoluteCanonicalUrl("/book"));
    expect(loginMetadata.alternates?.canonical).toBe(absoluteCanonicalUrl("/cleaner/login"));
    expect(loginMetadata.robots).toEqual({ index: false, follow: false });
    expect(loginMetadata.openGraph).toMatchObject({ title: "Cleaner sign in — Shalean", url: absoluteCanonicalUrl("/cleaner/login") });
  });
  it("keeps metadata independent of personal query parameters", async () => {
    const meta = await generateMetadata(props("regular-cleaning", { email: "private@example.com", referral: "private-code" }));
    expect(JSON.stringify(meta)).not.toContain("private");
  });
  it("has an appropriate invalid-slug redirect destination fallback", async () => {
    const meta = await generateMetadata(props("not-a-service"));
    expect(meta.alternates?.canonical).toBe(absoluteCanonicalUrl("/book"));
  });
});

describe("SEO-META-07 booking headings and preserved redirects", () => {
  it.each(SERVICE_SLUGS)("server-renders one meaningful heading for %s", async (slug) => {
    const result = await ServiceBookingPage(props(slug));
    const html = renderToStaticMarkup(result);
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    expect(html).toContain(`Book ${SERVICE_CONFIG[slug].label} in Cape Town`);
    expect(html).toContain(`data-booking-service="${slug}"`);
  });
  it("still redirects invalid services", async () => {
    await expect(ServiceBookingPage(props("not-a-service"))).rejects.toThrow("NEXT_REDIRECT");
  });
});
