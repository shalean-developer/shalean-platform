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
      className="scroll-mt-24 !bg-[var(--marketing-surface-warm)] md:py-[var(--ui-space-24)]"
      aria-label="Areas we serve"
    >
      <div className="grid gap-[var(--ui-space-12)] lg:grid-cols-[minmax(0,0.72fr)_minmax(0,1.28fr)] lg:items-start lg:gap-[var(--ui-space-20)]">
        <div className="lg:sticky lg:top-28">
          <MarketingSectionHeader
            align="left"
            eyebrow="Areas we serve"
            title="Cleaning across Cape Town"
            description="Explore the main Cape Town regions we serve, then open the full suburb directory to check local coverage."
          />
          <SafeInternalLink
            href="/areas-we-serve"
            className="mt-[var(--ui-space-8)] inline-flex min-h-12 items-center justify-center gap-[var(--ui-space-2)] rounded-[var(--ui-radius-pill)] bg-primary px-[var(--ui-space-6)] text-[length:var(--ui-text-small)] font-semibold text-primary-foreground shadow-[var(--ui-shadow-sm)] transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            View all suburbs
            <ArrowRight className="h-4 w-4" aria-hidden />
          </SafeInternalLink>
        </div>

        <div className="overflow-hidden rounded-[var(--ui-radius-marketing)] border border-border bg-card shadow-[var(--ui-shadow-md)]">
          {regionGroups.map(({ region, previewNames }, index) => (
            <SafeInternalLink
              key={region}
              href={`/areas-we-serve#region-${regionAnchor(region)}`}
              className="group grid min-h-[132px] gap-[var(--ui-space-4)] border-b border-border p-[var(--ui-space-6)] transition last:border-b-0 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center md:p-[var(--ui-space-8)]"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary" aria-hidden>
                <MapPin className="h-6 w-6" strokeWidth={1.7} />
              </div>
              <div>
                <div className="flex items-baseline gap-[var(--ui-space-3)]">
                  <span className="text-[length:var(--ui-text-caption)] font-semibold tabular-nums text-muted-foreground">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <h3 className="text-[length:var(--ui-text-section-title)] font-semibold leading-[var(--ui-leading-tight)] tracking-tight text-foreground">
                    {region}
                  </h3>
                </div>
                {previewNames.length > 0 ? (
                  <p className="mt-[var(--ui-space-2)] text-[length:var(--ui-text-small)] leading-[var(--ui-leading-body)] text-muted-foreground">
                    {previewNames.join(" · ")}
                  </p>
                ) : null}
              </div>
              <span className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-background text-foreground transition group-hover:border-primary/30 group-hover:bg-primary group-hover:text-primary-foreground" aria-hidden>
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </span>
            </SafeInternalLink>
          ))}
        </div>
      </div>
    </HomeSection>
  );
}
