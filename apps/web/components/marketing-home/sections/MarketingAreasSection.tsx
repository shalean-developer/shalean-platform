import { ArrowRight, MapPin } from "lucide-react";
import { SafeInternalLink } from "@/components/links/SafeInternalLink";
import { HomeSection } from "@/components/marketing-home/primitives/HomeSection";
import { MarketingSectionHeader } from "@/components/marketing-home/primitives/MarketingSectionHeader";
import {
  LOCATIONS_INDEX_REGION_ORDER,
  groupCapeTownLocationsByRegion,
} from "@/lib/locations/locations-index-config";
import { CAPE_TOWN_LOCATIONS } from "@/lib/seo/capeTownLocations";

const HOME_REGION_FEATURES: Readonly<Record<string, readonly string[]>> = {
  "Atlantic Seaboard": ["Sea Point", "Green Point", "Camps Bay"],
  "Southern Suburbs": ["Claremont", "Rondebosch", "Constantia"],
  "City Bowl": ["Gardens", "Oranjezicht", "Vredehoek"],
  "Northern Suburbs": ["Bellville", "Durbanville", "Century City"],
  Blouberg: ["Table View", "Bloubergstrand", "Milnerton"],
};

function regionAnchor(region: string): string {
  return region
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

export function MarketingAreasSection() {
  const byRegion = groupCapeTownLocationsByRegion(CAPE_TOWN_LOCATIONS);
  const regionGroups = LOCATIONS_INDEX_REGION_ORDER.map((region) => {
    const regionLocations = byRegion.get(region) ?? [];
    const availableNames = new Set(regionLocations.map((location) => location.name));
    const previewNames = (HOME_REGION_FEATURES[region] ?? []).filter((name) => availableNames.has(name));

    return { region, previewNames };
  });

  return (
    <HomeSection
      id="locations"
      containerSize="marketing"
      className="scroll-mt-24 !bg-[var(--marketing-surface-warm)] md:py-[var(--ui-space-20)]"
      aria-label="Areas we serve"
    >
      <MarketingSectionHeader
        eyebrow="Areas we serve"
        title="Cleaning across Cape Town"
        description="Explore the main Cape Town regions we serve, then view the full suburb directory for local availability."
      />

      <div className="mt-[var(--ui-space-16)] grid gap-[var(--ui-space-4)] sm:grid-cols-2 lg:grid-cols-5">
        {regionGroups.map(({ region, previewNames }) => (
          <article
            key={region}
            className="group flex min-h-[250px] flex-col rounded-[var(--ui-radius-marketing)] border border-border/70 bg-card p-[var(--ui-space-6)] shadow-[var(--ui-shadow-sm)] transition duration-200 hover:-translate-y-1 hover:shadow-[var(--ui-shadow-md)]"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary" aria-hidden>
              <MapPin className="h-6 w-6" strokeWidth={1.7} />
            </div>
            <h3 className="mt-[var(--ui-space-5)] text-[length:var(--ui-text-card-title)] font-semibold leading-[var(--ui-leading-tight)] text-foreground">
              {region}
            </h3>
            {previewNames.length > 0 ? (
              <p className="mt-[var(--ui-space-3)] text-[length:var(--ui-text-small)] leading-[var(--ui-leading-body)] text-muted-foreground">
                {previewNames.join(" · ")}
              </p>
            ) : null}
            <SafeInternalLink
              href={`/areas-we-serve#region-${regionAnchor(region)}`}
              className="mt-auto inline-flex items-center gap-[var(--ui-space-2)] pt-[var(--ui-space-6)] text-[length:var(--ui-text-small)] font-medium text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Explore region
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
            </SafeInternalLink>
          </article>
        ))}
      </div>

      <div className="mt-[var(--ui-space-10)] flex justify-center">
        <SafeInternalLink
          href="/areas-we-serve"
          className="inline-flex min-h-12 items-center justify-center rounded-[var(--ui-radius-pill)] border border-border bg-card px-[var(--ui-space-6)] text-[length:var(--ui-text-small)] font-semibold text-card-foreground shadow-[var(--ui-shadow-sm)] transition hover:border-primary/40 hover:bg-primary/5 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          View all suburbs
        </SafeInternalLink>
      </div>
    </HomeSection>
  );
}
