import Link from "next/link";
import { GrowthCtaLink } from "@/components/growth/GrowthCtaLink";
import { nearbyProgrammaticLocations, PROGRAMMATIC_LOCATIONS } from "@/lib/seo/locations";
import { CAPE_TOWN_SERVICE_SEO, type CapeTownSeoServiceSlug } from "@/lib/seo/capeTownSeoPages";
import { linkInNavClassName } from "@/lib/ui/linkClassNames";
import { cn } from "@/lib/utils";

const CAPE_TOWN_SEO_HUB_HREF = "/locations/cape-town-cleaning-services";
const CAPE_TOWN_SEO_HUB_LABEL = "Cleaning services Cape Town (overview)";

export type RelatedLinksPlacement = "blog" | "location" | "service" | "services_hub";

type Props = {
  placement: RelatedLinksPlacement;
  /** On a service SEO page, omit so other service hubs surface (2+ links). */
  currentServiceSlug?: CapeTownSeoServiceSlug;
  /** On a location SEO page, omit so other suburb hubs surface (2+ links). */
  currentLocationSlug?: string;
};

const SERVICE_ROWS: { slug: CapeTownSeoServiceSlug; label: string }[] = [
  { slug: "deep-cleaning-cape-town", label: "Deep cleaning services in Cape Town" },
  { slug: "standard-cleaning-cape-town", label: "Standard home cleaning services in Cape Town" },
  { slug: "office-cleaning-cape-town", label: "Office cleaning services in Cape Town" },
  { slug: "airbnb-cleaning-cape-town", label: "Airbnb cleaning services in Cape Town" },
  { slug: "move-out-cleaning-cape-town", label: "Move-out cleaning services in Cape Town" },
];

function pickServiceLinks(exclude?: CapeTownSeoServiceSlug) {
  const rows = exclude ? SERVICE_ROWS.filter((r) => r.slug !== exclude) : SERVICE_ROWS;
  return rows.slice(0, 3);
}

function pickLocationLinks(excludeSlug?: string, max = 3) {
  if (excludeSlug) {
    return nearbyProgrammaticLocations(excludeSlug, max).map((loc) => ({
      slug: loc.slug,
      href: `/locations/${loc.slug}`,
      label: `${loc.name} cleaning services`,
    }));
  }
  const rows = PROGRAMMATIC_LOCATIONS.map((loc) => ({
    slug: loc.slug,
    href: `/locations/${loc.slug}`,
    label: `${loc.name} cleaning services`,
  }));
  return rows.slice(0, max);
}

function capeTownHubFirst(
  placement: RelatedLinksPlacement,
  currentLocationSlug: string | undefined,
): { slug: string; href: string; label: string }[] {
  if (placement === "blog") {
    return [{ slug: "cape-town-hub", href: CAPE_TOWN_SEO_HUB_HREF, label: CAPE_TOWN_SEO_HUB_LABEL }];
  }
  if (placement === "location" && currentLocationSlug && currentLocationSlug !== CAPE_TOWN_SEO_HUB_HREF.replace("/locations/", "")) {
    return [{ slug: "cape-town-hub", href: CAPE_TOWN_SEO_HUB_HREF, label: CAPE_TOWN_SEO_HUB_LABEL }];
  }
  if (placement === "service" || placement === "services_hub") {
    return [{ slug: "cape-town-hub", href: CAPE_TOWN_SEO_HUB_HREF, label: CAPE_TOWN_SEO_HUB_LABEL }];
  }
  return [];
}

/**
 * Structured internal links: 3 service hubs, 3 location hubs, booking CTA.
 * Use on blog, location, service, and services hub pages so crawl paths stay dense.
 */
export function RelatedLinks({ placement, currentServiceSlug, currentLocationSlug }: Props) {
  const services = pickServiceLinks(currentServiceSlug);
  const hubRows = capeTownHubFirst(placement, currentLocationSlug);
  const nearbyCount = placement === "location" && currentLocationSlug ? 3 : placement === "blog" ? 2 : 3;
  const locations = [...hubRows, ...pickLocationLinks(currentLocationSlug, nearbyCount)];
  const bookingSource = `related_links_${placement}`;

  return (
    <section
      className="not-prose rounded-2xl border border-zinc-200 bg-zinc-50/90 px-6 py-8 shadow-sm"
      aria-labelledby="related-links-heading"
    >
      <h2 id="related-links-heading" className="text-lg font-bold tracking-tight text-zinc-900">
        Related links
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-zinc-600">
        Discover more Shalean guides across Cape Town—each page is built for search and booking clarity.
      </p>

      <div className="mt-6 grid gap-8 sm:grid-cols-2">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Services</h3>
          <ul className="mt-3 space-y-2">
            {services.map((row) => (
              <li key={row.slug}>
                <Link href={CAPE_TOWN_SERVICE_SEO[row.slug].path} className={cn(linkInNavClassName, "text-sm font-medium")}>
                  {row.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Areas</h3>
          <ul className="mt-3 space-y-2">
            {locations.map((row) => (
              <li key={row.slug}>
                <Link href={row.href} className={cn(linkInNavClassName, "text-sm font-medium")}>
                  {row.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-8 border-t border-zinc-200 pt-6 text-center">
        <p className="text-sm font-medium text-zinc-800">Ready to book?</p>
        <GrowthCtaLink
          href="/booking?step=entry"
          source={bookingSource}
          className="mt-3 inline-flex min-h-11 items-center justify-center rounded-full bg-blue-600 px-6 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
        >
          Book a cleaning in Cape Town
        </GrowthCtaLink>
      </div>
    </section>
  );
}
