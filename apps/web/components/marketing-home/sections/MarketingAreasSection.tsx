import { SafeInternalLink } from "@/components/links/SafeInternalLink";
import { ArrowRight, ArrowUpRight, MapPin } from "lucide-react";
import { GrowthCtaLink } from "@/components/growth/GrowthCtaLink";
import { HomeSection } from "@/components/marketing-home/primitives/HomeSection";
import { MarketingSectionHeader } from "@/components/marketing-home/primitives/MarketingSectionHeader";
import type { HomeLocation } from "@/lib/home/data";
import {
  LOCATIONS_INDEX_REGION_ORDER,
  groupCapeTownLocationsByRegion,
} from "@/lib/locations/locations-index-config";
import { marketingHomeBookingHref } from "@/lib/marketing/marketingHomeAssets";
import { marketingPrimaryCtaClassName, marketingPrimaryCtaIconClassName } from "@/lib/marketing/marketingHomeCtaClasses";
import { mergeSuburbAreaLinks } from "@/lib/marketing/marketingAreaLinks";
import { CAPE_TOWN_LOCATIONS } from "@/lib/seo/capeTownLocations";

const HOME_REGION_FEATURES: Readonly<Record<string, readonly string[]>> = {
  "Atlantic Seaboard": ["Sea Point", "Green Point", "Camps Bay", "Hout Bay", "Clifton"],
  "Southern Suburbs": ["Claremont", "Rondebosch", "Constantia", "Newlands", "Wynberg"],
  "City Bowl": ["Gardens", "Oranjezicht", "Vredehoek", "Tamboerskloof", "De Waterkant"],
  "Northern Suburbs": ["Bellville", "Durbanville", "Century City", "Goodwood"],
  Blouberg: ["Table View", "Bloubergstrand", "Milnerton"],
};

const REGION_DESCRIPTIONS: Readonly<Record<string, string>> = {
  "Atlantic Seaboard": "Coastal homes, apartments and short stays.",
  "Southern Suburbs": "Family homes, rentals and established suburbs.",
  "City Bowl": "Apartments, terraces and inner-city homes.",
  "Northern Suburbs": "Family homes, townhouses and apartment precincts.",
  Blouberg: "Coastal apartments, family homes and short stays.",
};

type Props = {
  locations: HomeLocation[];
};

function regionAnchor(region: string): string {
  return region
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

/**
 * Homepage location overview grouped by the same canonical Cape Town region taxonomy used by
 * `/areas-we-serve`. The full suburb directory remains on that dedicated page.
 */
export function MarketingAreasSection({ locations }: Props) {
  const bookHref = marketingHomeBookingHref();
  const byRegion = groupCapeTownLocationsByRegion(CAPE_TOWN_LOCATIONS);
  const allSuburbs = mergeSuburbAreaLinks(locations);
  const canonicalNames = new Set(CAPE_TOWN_LOCATIONS.map((location) => location.name.toLowerCase()));
  const otherAreas = allSuburbs.filter(({ name }) => !canonicalNames.has(name.toLowerCase()));

  const regionGroups = LOCATIONS_INDEX_REGION_ORDER.map((region) => {
    const regionLocations = byRegion.get(region) ?? [];
    const regionLocationsByName = new Map(regionLocations.map((location) => [location.name, location]));
    const featuredNames = HOME_REGION_FEATURES[region] ?? [];
    const featuredLocations = featuredNames
      .map((name) => regionLocationsByName.get(name))
      .filter((location): location is (typeof regionLocations)[number] => Boolean(location));

    return {
      region,
      description: REGION_DESCRIPTIONS[region] ?? "Cape Town homes and workplaces.",
      locations: featuredLocations,
    };
  }).filter((group) => group.locations.length > 0);

  return (
    <HomeSection
      id="locations"
      containerSize="marketing"
      className="scroll-mt-24 !bg-[var(--marketing-surface-warm)] md:py-[var(--ui-space-20)]"
      aria-label="Areas we serve"
    >
      <MarketingSectionHeader
        eyebrow="Areas We Serve"
        title="Cleaning services across Cape Town."
        description="Choose your part of Cape Town to explore nearby suburbs. Add your address at checkout to confirm availability for your home or office."
      />

      <div className="mt-[var(--ui-space-16)] grid gap-[var(--ui-space-6)] md:grid-cols-2 xl:grid-cols-5">
        {regionGroups.map(({ region, description, locations: featuredLocations }) => (
          <article
            key={region}
            className="flex min-h-[360px] flex-col rounded-[var(--ui-radius-marketing)] bg-card p-[var(--ui-space-6)] text-card-foreground shadow-[var(--ui-shadow-lg)] transition-transform duration-200 hover:-translate-y-1"
          >
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/15" aria-hidden>
              <MapPin className="h-8 w-8 text-foreground" strokeWidth={1.6} />
            </div>

            <h3 className="mt-[var(--ui-space-5)] text-[length:var(--ui-text-card-title)] font-semibold leading-[var(--ui-leading-tight)] tracking-tight text-foreground">
              {region}
            </h3>
            <p className="mt-[var(--ui-space-2)] text-[length:var(--ui-text-small)] leading-[var(--ui-leading-body)] text-muted-foreground">
              {description}
            </p>

            <ul className="mt-[var(--ui-space-5)] divide-y divide-border border-y border-border">
              {featuredLocations.map((location) => (
                <li key={location.slug}>
                  <SafeInternalLink
                    href={`/locations/${location.slug}`}
                    className="group/location flex min-h-11 items-center justify-between gap-[var(--ui-space-2)] py-[var(--ui-space-2)] text-[length:var(--ui-text-small)] font-medium text-foreground transition hover:text-primary"
                  >
                    <span>{location.name}</span>
                    <ArrowRight
                      className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover/location:translate-x-0.5 group-hover/location:text-primary"
                      aria-hidden
                    />
                  </SafeInternalLink>
                </li>
              ))}
            </ul>

            <SafeInternalLink
              href={`/areas-we-serve#region-${regionAnchor(region)}`}
              className="mt-auto inline-flex items-center gap-[var(--ui-space-2)] pt-[var(--ui-space-5)] text-[length:var(--ui-text-small)] font-semibold text-primary transition hover:underline hover:underline-offset-4"
            >
              View {region}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </SafeInternalLink>
          </article>
        ))}
      </div>

      {otherAreas.length > 0 ? (
        <div className="mt-[var(--ui-space-8)] rounded-[var(--ui-radius-marketing)] border border-border bg-card p-[var(--ui-space-6)] shadow-[var(--ui-shadow-sm)]">
          <h3 className="text-[length:var(--ui-text-card-title)] font-semibold text-foreground">Other Cape Town areas</h3>
          <p className="mt-[var(--ui-space-2)] text-[length:var(--ui-text-small)] leading-[var(--ui-leading-body)] text-muted-foreground">
            Live service areas that are not yet mapped to one of the regional location hubs.
          </p>
          <div className="mt-[var(--ui-space-4)] flex flex-wrap gap-[var(--ui-space-2)]">
            {otherAreas.map(({ name, href }) => {
              const className =
                "inline-flex min-h-10 items-center rounded-[var(--ui-radius-pill)] border border-border bg-background px-[var(--ui-space-3)] text-[length:var(--ui-text-small)] font-medium text-foreground transition hover:border-primary/40 hover:bg-primary/5 hover:text-primary";

              return href ? (
                <SafeInternalLink key={name} href={href} className={className}>
                  {name}
                </SafeInternalLink>
              ) : (
                <span key={name} className={className}>
                  {name}
                </span>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="mt-[var(--ui-space-10)] flex flex-wrap items-center justify-center gap-[var(--ui-space-3)]">
        <GrowthCtaLink href={bookHref} source="marketing_areas_book_cleaner" className={marketingPrimaryCtaClassName}>
          Book a cleaner
        </GrowthCtaLink>
        <GrowthCtaLink
          href={bookHref}
          source="marketing_areas_book_cleaner_arrow"
          className={marketingPrimaryCtaIconClassName}
        >
          <span className="sr-only">Book a cleaner</span>
          <ArrowUpRight size={20} strokeWidth={2.25} aria-hidden />
        </GrowthCtaLink>
        <SafeInternalLink
          href="/areas-we-serve"
          className="inline-flex min-h-11 items-center justify-center rounded-[var(--ui-radius-lg)] border border-border bg-card px-[var(--ui-space-5)] text-[length:var(--ui-text-small)] font-semibold text-card-foreground transition hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
        >
          View all suburbs
        </SafeInternalLink>
      </div>
    </HomeSection>
  );
}
