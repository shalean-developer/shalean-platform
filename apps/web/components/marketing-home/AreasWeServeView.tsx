import Link from "next/link";
import { MapPin } from "lucide-react";
import { GrowthCtaLink } from "@/components/growth/GrowthCtaLink";
import {
  LOCATIONS_INDEX_REGION_ORDER,
  groupCapeTownLocationsByRegion,
} from "@/lib/locations/locations-index-config";
import { CAPE_TOWN_LOCATIONS } from "@/lib/seo/capeTownLocations";
import { marketingWhatsAppFloatMainPadding } from "@/lib/marketing/marketingMobileLayout";
import { SITE_ORIGIN } from "@/lib/site/canonical";

function regionSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

export function AreasWeServeView() {
  const byRegion = groupCapeTownLocationsByRegion(CAPE_TOWN_LOCATIONS);
  const regionKeys = [...byRegion.keys()].sort((a, b) => {
    const ia = LOCATIONS_INDEX_REGION_ORDER.indexOf(a);
    const ib = LOCATIONS_INDEX_REGION_ORDER.indexOf(b);
    const rank = (i: number) => (i === -1 ? 1000 : i);
    return rank(ia) - rank(ib) || a.localeCompare(b);
  });

  const itemListJsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Cape Town suburbs Shalean cleans",
    numberOfItems: CAPE_TOWN_LOCATIONS.length,
    itemListElement: CAPE_TOWN_LOCATIONS.map((loc, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: `${loc.name} cleaning services`,
      url: `${SITE_ORIGIN}/locations/${loc.slug}`,
    })),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }} />

      <main className={`bg-white text-slate-900 ${marketingWhatsAppFloatMainPadding}`}>
        <section className="border-b border-blue-100 bg-gradient-to-b from-blue-50/70 via-white to-white">
          <div className="mx-auto max-w-6xl px-4 pt-12 pb-14 sm:px-6 sm:pt-16 lg:px-8">
            <p className="text-sm font-semibold uppercase tracking-wide text-blue-600">Cape Town · Service areas</p>
            <h1 className="mt-3 max-w-3xl text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl lg:text-[2.75rem] lg:leading-[1.1]">
              Areas We Serve in Cape Town
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-relaxed text-slate-600">
              Shalean cleans homes and offices across Cape Town suburbs. Tap your area to open the local hub with
              pricing context, then book online with a locked quote.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <GrowthCtaLink
                href="/book"
                source="areas_we_serve_hero_book"
                className="inline-flex min-h-12 items-center justify-center rounded-xl bg-blue-600 px-8 text-base font-semibold text-white shadow-sm transition hover:bg-blue-700"
              >
                Book a clean
              </GrowthCtaLink>
              <Link
                href="/quote"
                className="inline-flex min-h-12 items-center justify-center rounded-xl border border-blue-600 bg-white px-8 text-base font-semibold text-blue-900 shadow-sm transition hover:bg-blue-50"
              >
                Get a free quote
              </Link>
            </div>
            <p className="mt-6 text-sm text-slate-600">
              Need suburb-level guides and checklists?{" "}
              <Link href="/locations" className="font-semibold text-blue-600 hover:underline">
                Browse all location hubs
              </Link>
            </p>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:px-8" aria-labelledby="areas-by-region-heading">
          <h2 id="areas-by-region-heading" className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
            Cape Town suburbs by region
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600 sm:text-base">
            Every suburb below is actively serviced. Each link opens a dedicated hub at{" "}
            <span className="whitespace-nowrap font-mono text-xs text-slate-500 sm:text-sm">/locations/…-cleaning-services</span>.
          </p>
          <div className="mt-12 space-y-14">
            {regionKeys.map((region) => {
              const locations = byRegion.get(region) ?? [];
              if (locations.length === 0) return null;
              return (
                <section
                  key={region}
                  className="scroll-mt-24"
                  aria-labelledby={`region-${regionSlug(region)}`}
                >
                  <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
                    <MapPin className="size-5 text-blue-600" aria-hidden />
                    <h3
                      id={`region-${regionSlug(region)}`}
                      className="text-xl font-bold tracking-tight text-slate-900"
                    >
                      {region}
                    </h3>
                  </div>
                  <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {locations.map((loc) => (
                      <li key={loc.slug}>
                        <Link
                          href={`/locations/${loc.slug}`}
                          className="flex min-h-[3.25rem] items-center rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm font-semibold text-slate-900 shadow-sm transition hover:border-blue-300 hover:bg-white hover:text-blue-900"
                        >
                          {loc.name}
                          <span className="ml-auto text-xs font-medium text-blue-600">Hub →</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        </section>

        <section className="border-t border-blue-900 bg-blue-800 py-16 text-white" aria-labelledby="areas-cta-heading">
          <div className="mx-auto max-w-6xl px-4 text-center sm:px-6 lg:px-8">
            <h2 id="areas-cta-heading" className="text-2xl font-bold tracking-tight sm:text-3xl">
              Ready to book in your suburb?
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-blue-100/90 sm:text-base">
              Add your address at checkout to confirm availability—your total is clear before we dispatch.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <GrowthCtaLink
                href="/book"
                source="areas_we_serve_footer_book"
                className="inline-flex min-h-12 w-full max-w-xs items-center justify-center rounded-xl bg-white px-8 text-base font-semibold text-blue-900 transition hover:bg-blue-50 sm:w-auto"
              >
                Book online
              </GrowthCtaLink>
              <Link
                href="/contact"
                className="inline-flex min-h-12 w-full max-w-xs items-center justify-center rounded-xl border border-blue-300/80 bg-transparent px-8 text-base font-semibold text-white transition hover:bg-blue-900/50 sm:w-auto"
              >
                Contact support
              </Link>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
