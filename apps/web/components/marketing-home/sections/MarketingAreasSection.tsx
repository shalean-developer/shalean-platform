import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { GrowthCtaLink } from "@/components/growth/GrowthCtaLink";
import type { HomeLocation } from "@/lib/home/data";
import { marketingHomeLocationHref } from "@/lib/marketing/homeLocationHref";
import { marketingHomeBookingHref } from "@/lib/marketing/marketingHomeAssets";
import { marketingPrimaryCtaClassName, marketingPrimaryCtaIconClassName } from "@/lib/marketing/marketingHomeCtaClasses";
import { FOOTER_POPULAR_LOCATION_HUBS, PROGRAMMATIC_LOCATIONS } from "@/lib/seo/locations";
import { linkEmphasisClassName, linkInNavClassName, linkInParagraphClassName } from "@/lib/ui/linkClassNames";
import { cn } from "@/lib/utils";

type AreasHubLink = {
  key: string;
  href: string;
  name: string;
};

function buildProgrammaticHubLinks(): AreasHubLink[] {
  return PROGRAMMATIC_LOCATIONS.map((loc) => ({
    key: loc.slug,
    href: `/locations/${loc.slug}`,
    name: loc.name,
  }));
}

/** Merge CMS locations that resolve to hubs not already in the programmatic catalogue. */
function mergeCmsHubExtras(programmatic: AreasHubLink[], locations: HomeLocation[]): AreasHubLink[] {
  const seen = new Set(programmatic.map((p) => p.key));
  const extras: AreasHubLink[] = [];

  for (const loc of locations) {
    const href = marketingHomeLocationHref(loc);
    if (!href) continue;
    const slug = href.replace(/^\/locations\//, "").replace(/^\//, "");
    if (seen.has(slug)) continue;
    seen.add(slug);
    extras.push({ key: slug, href, name: loc.name });
  }

  return [...programmatic, ...extras].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

type Props = {
  locations: HomeLocation[];
};

/**
 * Unified areas section — layout aligned with marketing homepage reference:
 * eyebrow + headline / intro column, suburb pill cloud, booking CTA pair.
 */
export function MarketingAreasSection({ locations }: Props) {
  const bookHref = marketingHomeBookingHref();
  const programmatic = buildProgrammaticHubLinks();
  const allHubs = mergeCmsHubExtras(programmatic, locations);

  /** Homepage-only row — matches `FOOTER_POPULAR_LOCATION_HUBS` order (horizontal flow, wraps when narrow). */
  const popularRowLinks: AreasHubLink[] = FOOTER_POPULAR_LOCATION_HUBS.map(({ name, slug }) => ({
    key: slug,
    href: `/locations/${slug}`,
    name,
  }));

  const chipClass = cn(
    "inline-flex w-full min-w-0 justify-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-normal leading-snug text-slate-700 shadow-none transition-colors duration-200 sm:px-4 sm:py-2.5 sm:text-sm lg:justify-start lg:px-3 lg:py-2 lg:text-xs xl:px-4 xl:text-sm",
    linkInNavClassName,
  );

  return (
    <section id="locations" className="scroll-mt-24 border-t border-slate-100 bg-white py-16 md:py-20 lg:py-14">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-2 lg:gap-12 lg:items-start xl:gap-16">
          <header className="max-w-xl">
            <p className="text-sm font-medium tracking-wide text-slate-400">— Areas We Serve</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">
              Cleaning services across Cape Town suburbs
            </h2>
          </header>

          <div className="max-w-xl space-y-4 text-sm leading-relaxed text-slate-600 md:text-base lg:pt-1">
            <p>
              We currently serve the areas below. Add your address at checkout to confirm availability for your home or
              office.
            </p>
            <p>
              Browse all{" "}
              <Link href="/services" className={linkInParagraphClassName}>
                cleaning services
              </Link>
              , read the{" "}
              <Link href="/blog" className={linkInParagraphClassName}>
                blog
              </Link>
              , or open the{" "}
              <Link href="/locations/cape-town-cleaning-services" className={linkInParagraphClassName}>
                Cape Town cleaning overview
              </Link>
              .
            </p>
            <p>
              We also cover specific areas like{" "}
              <Link href="/blog/cleaning-services-claremont-cape-town" className={linkInParagraphClassName}>
                cleaning services in Claremont
              </Link>
              ,{" "}
              <Link href="/blog/deep-cleaning-gardens-cape-town" className={linkInParagraphClassName}>
                Gardens cleaning services
              </Link>
              ,{" "}
              <Link href="/blog/move-out-cleaning-rondebosch-cape-town" className={linkInParagraphClassName}>
                Rondebosch cleaning services
              </Link>
              ,{" "}
              <Link href="/blog/regular-home-cleaning-wynberg-cape-town" className={linkInParagraphClassName}>
                Wynberg cleaning services
              </Link>
              ,{" "}
              <Link href="/blog/affordable-cleaning-observatory-cape-town" className={linkInParagraphClassName}>
                Observatory cleaning services
              </Link>
              ,{" "}
              <Link href="/blog/home-cleaning-plumstead-cape-town" className={linkInParagraphClassName}>
                Plumstead cleaning services
              </Link>
              ,{" "}
              <Link href="/blog/home-cleaning-constantia-cape-town" className={linkInParagraphClassName}>
                Constantia cleaning services
              </Link>
              ,{" "}
              <Link href="/blog/luxury-home-cleaning-camps-bay-cape-town" className={linkInParagraphClassName}>
                Camps Bay cleaning services
              </Link>
              , and{" "}
              <Link href="/blog/airbnb-cleaning-green-point-cape-town" className={linkInParagraphClassName}>
                Green Point cleaning services
              </Link>
              .
            </p>
          </div>
        </div>

        <div className="mt-10 md:mt-12">
          <h3 className="text-sm font-bold text-slate-900 md:text-base">Popular Areas</h3>
          <nav className="mt-2 text-sm leading-relaxed text-slate-700 md:text-base" aria-label="Popular Areas">
            {popularRowLinks.map((hub, index) => (
              <span key={hub.key}>
                {index > 0 ? ", " : null}
                <Link
                  href={hub.href}
                  className={`font-medium ${linkInParagraphClassName}`}
                  title={`Cleaning services in ${hub.name}`}
                >
                  {hub.name}
                </Link>
              </span>
            ))}
          </nav>
          <Link href="/locations" className={`mt-3 inline-block text-sm font-semibold ${linkEmphasisClassName}`}>
            View all locations
          </Link>
        </div>

        <ul
          className="mt-12 grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3 md:mt-12 md:grid-cols-3 md:gap-3 lg:mt-10 lg:grid-cols-4 lg:gap-2 xl:grid-cols-5 xl:gap-3"
          aria-label="All Cape Town area hubs"
        >
          {allHubs.map((hub) => (
            <li key={hub.key} className="min-w-0">
              <Link href={hub.href} className={chipClass}>
                Cleaning services in {hub.name}
              </Link>
            </li>
          ))}
        </ul>

        <p className="mt-6 flex flex-wrap gap-x-3 gap-y-2 text-sm text-slate-600 lg:mt-5">
          <Link href="/locations" className={`font-semibold ${linkInParagraphClassName}`}>
            View all locations
          </Link>
          <span className="text-slate-300" aria-hidden>
            ·
          </span>
          <Link href="/locations/cape-town-cleaning-services" className={`font-semibold ${linkInParagraphClassName}`}>
            Cape Town cleaning overview
          </Link>
        </p>

        <div className="mt-10 flex flex-wrap items-center gap-2.5 md:gap-3">
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
        </div>
      </div>
    </section>
  );
}
