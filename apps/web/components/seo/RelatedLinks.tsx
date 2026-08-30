import { SafeInternalLink } from "@/components/links/SafeInternalLink";
import { GrowthCtaLink } from "@/components/growth/GrowthCtaLink";
import {
  CAPE_TOWN_PRICING_EDUCATION_BLOG_HREF,
  CAPE_TOWN_PRICING_AUTHORITY_HREF,
} from "@/lib/seo/internalLinks";
import { nearbyProgrammaticLocations, PROGRAMMATIC_LOCATIONS } from "@/lib/seo/locations";
import { CAPE_TOWN_LOCATIONS_OVERVIEW_PATH } from "@/lib/seo/capeTownLocations";
import { CAPE_TOWN_SERVICE_SEO, type CapeTownSeoServiceSlug } from "@/lib/seo/capeTownSeoPages";
import { SEO_REBUILD_SUPPRESS_LOCATION_HUB_LINKS } from "@/lib/seo/seoRebuildPhase1";
import { cn } from "@/lib/utils";

const CAPE_TOWN_SEO_HUB_LABEL = "Cleaning services Cape Town (city hub)";

export type RelatedLinksPlacement = "blog" | "location" | "service" | "services_hub";

type Props = {
  placement: RelatedLinksPlacement;
  currentServiceSlug?: CapeTownSeoServiceSlug;
  currentLocationSlug?: string;
  emphasizeLocalBooking?: boolean;
  variant?: "card" | "plain";
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

const PHASE1_AREA_FALLBACK_LINKS: { slug: string; href: string; label: string }[] = [
  { slug: "services-hub", href: CAPE_TOWN_PRICING_AUTHORITY_HREF, label: "Cleaning services in Cape Town" },
  {
    slug: "pricing-guide",
    href: CAPE_TOWN_PRICING_EDUCATION_BLOG_HREF,
    label: "Cleaning prices guide (Cape Town)",
  },
  { slug: "faq", href: "/faq", label: "Cleaning FAQs" },
];

function pickLocationLinks(excludeSlug?: string, max = 3) {
  if (SEO_REBUILD_SUPPRESS_LOCATION_HUB_LINKS) {
    return PHASE1_AREA_FALLBACK_LINKS.slice(0, max);
  }
  if (excludeSlug) {
    return nearbyProgrammaticLocations(excludeSlug, max).map((loc) => ({
      slug: loc.slug,
      href: `/locations/${loc.slug}`,
      label: `Cleaning services in ${loc.name}`,
    }));
  }
  const rows = PROGRAMMATIC_LOCATIONS.map((loc) => ({
    slug: loc.slug,
    href: `/locations/${loc.slug}`,
    label: `Cleaning services in ${loc.name}`,
  }));
  return rows.slice(0, max);
}

function capeTownHubFirst(
  placement: RelatedLinksPlacement,
  currentLocationSlug: string | undefined,
): { slug: string; href: string; label: string }[] {
  if (SEO_REBUILD_SUPPRESS_LOCATION_HUB_LINKS) return [];
  if (placement === "blog") {
    return [{ slug: "cape-town-hub", href: CAPE_TOWN_LOCATIONS_OVERVIEW_PATH, label: CAPE_TOWN_SEO_HUB_LABEL }];
  }
  if (placement === "location" && currentLocationSlug) {
    return [{ slug: "cape-town-hub", href: CAPE_TOWN_LOCATIONS_OVERVIEW_PATH, label: CAPE_TOWN_SEO_HUB_LABEL }];
  }
  if (placement === "service" || placement === "services_hub") {
    return [{ slug: "cape-town-hub", href: CAPE_TOWN_LOCATIONS_OVERVIEW_PATH, label: CAPE_TOWN_SEO_HUB_LABEL }];
  }
  return [];
}

export function RelatedLinks({
  placement,
  currentServiceSlug,
  currentLocationSlug,
  emphasizeLocalBooking,
  variant = "card",
}: Props) {
  const services = pickServiceLinks(currentServiceSlug);
  const hubRows = capeTownHubFirst(placement, currentLocationSlug);
  const nearbyCount = placement === "location" && currentLocationSlug ? 3 : placement === "blog" ? 2 : 3;
  const locations = [...hubRows, ...pickLocationLinks(currentLocationSlug, nearbyCount)];
  const bookingSource = `related_links_${placement}`;
  const localBlog = placement === "blog" && emphasizeLocalBooking;
  const isPlain = variant === "plain";

  return (
    <section
      className={cn(
        "not-prose text-card-foreground",
        isPlain
          ? "border-t border-border pt-[var(--ui-space-6)]"
          : "rounded-[var(--ui-radius-marketing)] border border-border bg-card p-[var(--ui-space-8)] shadow-[var(--ui-shadow-sm)]",
      )}
      aria-labelledby="related-links-heading"
    >
      <p className="text-[length:var(--ui-text-caption)] font-semibold uppercase tracking-[0.14em] text-primary">Keep exploring</p>
      <h2
        id="related-links-heading"
        className="mt-[var(--ui-space-3)] text-[length:var(--ui-text-section-title)] font-semibold leading-[var(--ui-leading-tight)] tracking-tight text-foreground"
      >
        {localBlog ? "Cleaners near you in Cape Town" : "Related links"}
      </h2>
      <p className="mt-[var(--ui-space-3)] max-w-2xl text-[length:var(--ui-text-small)] leading-[var(--ui-leading-body)] text-muted-foreground">
        {localBlog
          ? "Jump to a suburb hub or service guide, then continue to booking with the same pricing flow."
          : "Continue through Shalean service and location guides without losing your path back to booking."}
      </p>

      <div className={cn("grid gap-[var(--ui-space-8)] sm:grid-cols-2", isPlain ? "mt-[var(--ui-space-6)]" : "mt-[var(--ui-space-8)]")}>
        <div>
          <h3 className="text-[length:var(--ui-text-caption)] font-semibold uppercase tracking-[0.14em] text-foreground/55">Services</h3>
          <ul className="mt-[var(--ui-space-3)] space-y-[var(--ui-space-3)]">
            {services.map((row) => (
              <li key={row.slug}>
                <SafeInternalLink
                  href={CAPE_TOWN_SERVICE_SEO[row.slug].path}
                  className="text-[length:var(--ui-text-small)] font-medium text-foreground transition hover:text-primary hover:underline hover:underline-offset-4"
                >
                  {row.label}
                </SafeInternalLink>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="text-[length:var(--ui-text-caption)] font-semibold uppercase tracking-[0.14em] text-foreground/55">Areas</h3>
          <ul className="mt-[var(--ui-space-3)] space-y-[var(--ui-space-3)]">
            {locations.map((row) => (
              <li key={row.slug}>
                <SafeInternalLink
                  href={row.href}
                  className="text-[length:var(--ui-text-small)] font-medium text-foreground transition hover:text-primary hover:underline hover:underline-offset-4"
                >
                  {row.label}
                </SafeInternalLink>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className={cn("border-t border-border pt-[var(--ui-space-6)]", isPlain ? "mt-[var(--ui-space-6)]" : "mt-[var(--ui-space-8)]")}>
        <GrowthCtaLink
          href="/book"
          source={bookingSource}
          className={cn(
            "inline-flex min-h-12 items-center justify-center rounded-[var(--ui-radius-pill)] text-[length:var(--ui-text-small)] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            isPlain
              ? "px-0 text-primary hover:underline hover:underline-offset-4"
              : "bg-primary px-[var(--ui-space-6)] text-primary-foreground shadow-[var(--ui-shadow-sm)] hover:brightness-95",
          )}
        >
          {localBlog ? "See instant price" : "Book a cleaning in Cape Town"}
        </GrowthCtaLink>
      </div>
    </section>
  );
}
