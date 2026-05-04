import Link from "next/link";
import { CalendarCheck, ClipboardList, ListChecks, Lock, MapPinned, ShieldCheck, Star } from "lucide-react";
import { GrowthCtaLink } from "@/components/growth/GrowthCtaLink";
import { LocationCard } from "@/components/locations/LocationCard";
import { LocationGroup } from "@/components/locations/LocationGroup";
import { LocationSearch, type LocationSearchItem } from "@/components/locations/LocationSearch";
import { LocationsIndexStickyCta } from "@/components/locations/LocationsIndexStickyCta";
import {
  LOCATIONS_INDEX_BLOG_GUIDES,
  LOCATIONS_INDEX_QUICK_SLUGS,
  LOCATIONS_INDEX_REGION_ORDER,
  featuredDescriptorBySlug,
  getFeaturedLocationRows,
  groupCapeTownLocationsByRegion,
} from "@/lib/locations/locations-index-config";
import { CAPE_TOWN_LOCATIONS } from "@/lib/seo/capeTownLocations";
import { GOOGLE_BUSINESS_REVIEWS } from "@/lib/seo/googleReviews";
import { linkEmphasisClassName } from "@/lib/ui/linkClassNames";
import { SITE_ORIGIN } from "@/lib/site/canonical";

function searchBlurb(row: (typeof CAPE_TOWN_LOCATIONS)[number]): string {
  const raw = row.uniqueContextLine.trim();
  if (raw.length <= 120) return raw;
  return `${raw.slice(0, 117).trim()}…`;
}

export function LocationsIndexView() {
  const byRegion = groupCapeTownLocationsByRegion(CAPE_TOWN_LOCATIONS);
  const regionKeys = [...byRegion.keys()].sort((a, b) => {
    const ia = LOCATIONS_INDEX_REGION_ORDER.indexOf(a);
    const ib = LOCATIONS_INDEX_REGION_ORDER.indexOf(b);
    const rank = (i: number) => (i === -1 ? 1000 : i);
    return rank(ia) - rank(ib) || a.localeCompare(b);
  });

  const featuredRows = getFeaturedLocationRows();
  const quickRows = LOCATIONS_INDEX_QUICK_SLUGS.map((slug) => CAPE_TOWN_LOCATIONS.find((r) => r.slug === slug)).filter(
    Boolean,
  ) as (typeof CAPE_TOWN_LOCATIONS)[number][];

  const searchItems: LocationSearchItem[] = CAPE_TOWN_LOCATIONS.map((row) => ({
    name: row.name,
    slug: row.slug,
    description: searchBlurb(row),
  }));

  const itemListJsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Shalean cleaning service hubs in Cape Town",
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

      <main className="bg-white pb-28 text-zinc-900 md:pb-0">
        {/* Hero */}
        <section className="border-b border-emerald-100 bg-gradient-to-b from-emerald-50/70 via-white to-white">
          <div className="mx-auto max-w-6xl px-4 pt-12 pb-14 sm:px-6 sm:pt-16 lg:px-8">
            <p className="text-sm font-semibold uppercase tracking-wide text-emerald-800">Cape Town · All suburbs</p>
            <h1 className="mt-3 max-w-3xl text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl lg:text-[2.75rem] lg:leading-[1.1]">
              Cleaning Services Across Cape Town
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-relaxed text-zinc-600">
              Find trusted cleaners in your area with transparent pricing and instant booking.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <GrowthCtaLink
                href="/booking/details"
                source="locations_index_hero_price"
                className="inline-flex min-h-12 items-center justify-center rounded-xl bg-emerald-600 px-8 text-base font-semibold text-white shadow-sm transition hover:bg-emerald-700"
              >
                Get instant price
              </GrowthCtaLink>
              <Link
                href="/services"
                className="inline-flex min-h-12 items-center justify-center rounded-xl border border-emerald-600 bg-white px-8 text-base font-semibold text-emerald-900 shadow-sm transition hover:bg-emerald-50"
              >
                Browse services
              </Link>
            </div>
            <p className="mt-6 text-sm text-zinc-600">
              Prefer the city overview?{" "}
              <Link href="/locations/cape-town-cleaning-services" className={`font-semibold ${linkEmphasisClassName}`}>
                Cape Town cleaning hub
              </Link>
            </p>
          </div>
        </section>

        {/* Search + quick select */}
        <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8" aria-labelledby="loc-find-heading">
          <h2 id="loc-find-heading" className="text-xl font-bold tracking-tight text-zinc-900 sm:text-2xl">
            Find your suburb
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-600 sm:text-base">
            Search the full list or jump to a popular Atlantic Seaboard or Southern Suburbs hub.
          </p>
          <div className="mt-8 space-y-6">
            <LocationSearch items={searchItems} />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Quick select</p>
              <ul className="mt-3 flex flex-wrap gap-2">
                {quickRows.map((loc) => (
                  <li key={loc.slug}>
                    <Link
                      href={`/locations/${loc.slug}`}
                      className="inline-flex min-h-11 items-center rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2 text-sm font-semibold text-zinc-900 shadow-sm transition hover:border-emerald-300 hover:bg-white hover:text-emerald-950"
                    >
                      {loc.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* Featured */}
        <section className="border-t border-zinc-100 bg-zinc-50/60 py-14" aria-labelledby="featured-areas-heading">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 id="featured-areas-heading" className="text-xl font-bold tracking-tight text-zinc-900 sm:text-2xl">
                  Featured areas
                </h2>
                <p className="mt-2 max-w-2xl text-sm text-zinc-600 sm:text-base">
                  High-demand hubs with local context, pricing bands, and the same locked-quote booking flow everywhere.
                </p>
              </div>
            </div>
            <ul className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {featuredRows.map((row) => (
                <li key={row.slug}>
                  <LocationCard
                    name={row.name}
                    slug={row.slug}
                    description={featuredDescriptorBySlug(row.slug) ?? searchBlurb(row)}
                  />
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Trust */}
        <section className="border-y border-zinc-200 bg-white" aria-label="Trust signals">
          <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
            <ul className="flex flex-wrap items-center justify-center gap-x-10 gap-y-4 text-sm font-medium text-zinc-800 sm:justify-between sm:text-[15px]">
              <li className="flex items-center gap-2">
                <Star className="size-5 fill-amber-400 text-amber-400" aria-hidden />
                <span>{GOOGLE_BUSINESS_REVIEWS.rating} Google rating</span>
              </li>
              <li className="flex items-center gap-2">
                <ShieldCheck className="size-5 text-emerald-700" aria-hidden />
                <span>Background-checked cleaners</span>
              </li>
              <li className="flex items-center gap-2">
                <CalendarCheck className="size-5 text-emerald-700" aria-hidden />
                <span>Same-day when routing allows</span>
              </li>
              <li className="flex items-center gap-2">
                <Lock className="size-5 text-emerald-700" aria-hidden />
                <span>Transparent pricing</span>
              </li>
            </ul>
          </div>
        </section>

        {/* How it works */}
        <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:px-8" aria-labelledby="how-heading">
          <h2 id="how-heading" className="text-xl font-bold tracking-tight text-zinc-900 sm:text-2xl">
            How it works
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-zinc-600 sm:text-base">Three steps — most customers finish in minutes.</p>
          <ol className="mt-10 grid gap-8 md:grid-cols-3">
            {[
              {
                step: "1",
                title: "Enter your location",
                body: "Pick your suburb hub for local routes and realistic scope—then add rooms and bathrooms online.",
                Icon: MapPinned,
              },
              {
                step: "2",
                title: "Choose your service",
                body: "Standard, deep, move-out, Airbnb, or office—compare guides if you need checklist detail.",
                Icon: ListChecks,
              },
              {
                step: "3",
                title: "Book instantly",
                body: "See your total, choose a slot, and confirm—adjust add-ons until the quote matches your visit.",
                Icon: ClipboardList,
              },
            ].map(({ step, title, body, Icon }) => (
              <li key={step} className="relative rounded-2xl border border-zinc-200 bg-zinc-50/50 p-6 shadow-sm">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-sm font-bold text-white">
                    {step}
                  </span>
                  <Icon className="size-6 text-emerald-800" strokeWidth={1.75} aria-hidden />
                </div>
                <h3 className="mt-4 text-lg font-bold text-zinc-900">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-600">{body}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Grouped regions */}
        <section className="border-t border-zinc-100 bg-white py-14" aria-labelledby="all-areas-heading">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <h2 id="all-areas-heading" className="text-xl font-bold tracking-tight text-zinc-900 sm:text-2xl">
              All areas by region
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-zinc-600 sm:text-base">
              Every link opens a dedicated hub at{" "}
              <span className="whitespace-nowrap font-mono text-xs text-zinc-500 sm:text-sm">/locations/…-cleaning-services</span>.
            </p>
            <div className="mt-12 space-y-14">
              {regionKeys.map((region) => (
                <LocationGroup key={region} regionTitle={region} locations={byRegion.get(region) ?? []} />
              ))}
            </div>
          </div>
        </section>

        {/* Blog guides */}
        <section className="border-t border-zinc-100 bg-zinc-50/70 py-14" aria-labelledby="guides-heading">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <h2 id="guides-heading" className="text-xl font-bold tracking-tight text-zinc-900 sm:text-2xl">
              Popular cleaning guides
            </h2>
            <p className="mt-2 text-sm text-zinc-600 sm:text-base">Editorial hubs that pair well with suburb pages and booking.</p>
            <ul className="mt-8 grid gap-4 md:grid-cols-3">
              {LOCATIONS_INDEX_BLOG_GUIDES.map((g) => (
                <li key={g.href}>
                  <Link
                    href={g.href}
                    className="flex h-full flex-col rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:border-emerald-300 hover:shadow-md"
                  >
                    <span className="text-base font-bold text-zinc-900">{g.title}</span>
                    <span className="mt-2 flex-1 text-sm text-zinc-600">{g.subtitle}</span>
                    <span className={`mt-4 text-sm font-semibold ${linkEmphasisClassName}`}>Read guide →</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Final CTA */}
        <section className="border-t border-emerald-900 bg-emerald-950 py-16 text-white" aria-labelledby="final-cta-heading">
          <div className="mx-auto max-w-6xl px-4 text-center sm:px-6 lg:px-8">
            <h2 id="final-cta-heading" className="text-2xl font-bold tracking-tight sm:text-3xl">
              Ready to book in your area?
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-emerald-100/90 sm:text-base">
              Lock scope online for any Cape Town hub—your total is clear before we dispatch.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <GrowthCtaLink
                href="/booking/details"
                source="locations_index_footer_price"
                className="inline-flex min-h-12 w-full max-w-xs items-center justify-center rounded-xl bg-white px-8 text-base font-semibold text-emerald-950 transition hover:bg-emerald-50 sm:w-auto"
              >
                Get exact price
              </GrowthCtaLink>
              <GrowthCtaLink
                href="/booking"
                source="locations_index_footer_book"
                className="inline-flex min-h-12 w-full max-w-xs items-center justify-center rounded-xl border border-emerald-400/80 bg-transparent px-8 text-base font-semibold text-white transition hover:bg-emerald-900/50 sm:w-auto"
              >
                Book now
              </GrowthCtaLink>
            </div>
          </div>
        </section>
      </main>

      <LocationsIndexStickyCta />
    </>
  );
}
