import { CAPE_TOWN_SERVICE_SEO } from "@/lib/seo/capeTownSeoPages";

/** Canonical service paths for contextual in-article linking (Cape Town). */
export const BLOG_CONTEXT_SERVICE_LINKS = [
  {
    href: CAPE_TOWN_SERVICE_SEO["standard-cleaning-cape-town"].path,
    anchor: "standard cleaning services in Cape Town",
  },
  {
    href: CAPE_TOWN_SERVICE_SEO["deep-cleaning-cape-town"].path,
    anchor: "deep cleaning services",
  },
  {
    href: CAPE_TOWN_SERVICE_SEO["airbnb-cleaning-cape-town"].path,
    anchor: "Airbnb cleaning services in Cape Town",
  },
  {
    href: CAPE_TOWN_SERVICE_SEO["move-out-cleaning-cape-town"].path,
    anchor: "move-out cleaning in Cape Town",
  },
  {
    href: CAPE_TOWN_SERVICE_SEO["carpet-cleaning-cape-town"].path,
    anchor: "carpet cleaning in Cape Town",
  },
] as const;

/** Three service links shown under Related Cleaning Guides (rotates by post slug for variety). */
export function relatedGuidesServiceTrio(currentSlug: string): readonly (typeof BLOG_CONTEXT_SERVICE_LINKS)[number][] {
  const idx = Math.abs(hashSlug(currentSlug)) % BLOG_CONTEXT_SERVICE_LINKS.length;
  const trio: (typeof BLOG_CONTEXT_SERVICE_LINKS)[number][] = [];
  for (let i = 0; i < 3; i++) {
    trio.push(BLOG_CONTEXT_SERVICE_LINKS[(idx + i) % BLOG_CONTEXT_SERVICE_LINKS.length]);
  }
  return trio;
}

function hashSlug(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h << 5) - h + s.charCodeAt(i);
  return h | 0;
}
