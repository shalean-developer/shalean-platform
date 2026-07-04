import { SafeInternalLink } from "@/components/links/SafeInternalLink";
import { ArrowUpRight } from "lucide-react";
import { GrowthCtaLink } from "@/components/growth/GrowthCtaLink";
import type { HomeLocation } from "@/lib/home/data";
import { marketingHomeBookingHref } from "@/lib/marketing/marketingHomeAssets";
import { marketingPrimaryCtaClassName, marketingPrimaryCtaIconClassName } from "@/lib/marketing/marketingHomeCtaClasses";
import { PROGRAMMATIC_LOCATIONS } from "@/lib/seo/locations";
import { linkInParagraphClassName } from "@/lib/ui/linkClassNames";
import { cn } from "@/lib/utils";

const POPULAR_AREA_NAMES = ["Sea Point", "Claremont", "Constantia", "Bellville", "Durbanville"] as const;

type Props = {
  locations: HomeLocation[];
};

function mergeSuburbNames(locations: HomeLocation[]): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const loc of PROGRAMMATIC_LOCATIONS) {
    if (seen.has(loc.name)) continue;
    seen.add(loc.name);
    names.push(loc.name);
  }
  for (const loc of locations) {
    if (seen.has(loc.name)) continue;
    seen.add(loc.name);
    names.push(loc.name);
  }
  return names.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

/**
 * Unified areas section — layout aligned with marketing homepage reference:
 * eyebrow + headline / intro column, suburb pill cloud, booking CTA pair.
 */
export function MarketingAreasSection({ locations }: Props) {
  const bookHref = marketingHomeBookingHref();
  const allSuburbs = mergeSuburbNames(locations);

  const chipClass = cn(
    "inline-flex w-full min-w-0 justify-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-normal leading-snug text-slate-700 shadow-none sm:px-4 sm:py-2.5 sm:text-sm lg:justify-start lg:px-3 lg:py-2 lg:text-xs xl:px-4 xl:text-sm",
  );

  return (
    <section id="locations" className="scroll-mt-24 border-t border-slate-100 bg-white py-16 md:py-20 lg:py-14">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-2 lg:gap-12 lg:items-start xl:gap-16">
          <header className="max-w-xl">
            <p className="text-sm font-medium tracking-wide text-slate-400">— Areas We Serve</p>
            <h2 className="mt-3 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl md:text-4xl">
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
              <SafeInternalLink href="/services" className={linkInParagraphClassName}>
                cleaning services
              </SafeInternalLink>
              , read the{" "}
              <SafeInternalLink href="/blog" className={linkInParagraphClassName}>
                blog
              </SafeInternalLink>
              , or{" "}
              <SafeInternalLink href="/book" className={linkInParagraphClassName}>
                book a cleaner online
              </SafeInternalLink>
              .
            </p>
          </div>
        </div>

        <div className="mt-10 md:mt-12">
          <h3 className="text-sm font-bold text-slate-900 md:text-base">Popular cleaning areas</h3>
          <div className="mt-2 flex flex-wrap gap-2 text-sm md:text-base" aria-label="Popular cleaning areas">
            {POPULAR_AREA_NAMES.map((name) => (
              <span
                key={name}
                className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-800 shadow-sm"
              >
                {name}
              </span>
            ))}
          </div>
        </div>

        <ul
          className="mt-12 grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3 md:mt-12 md:grid-cols-3 md:gap-3 lg:mt-10 lg:grid-cols-4 lg:gap-2 xl:grid-cols-5 xl:gap-3"
          aria-label="All Cape Town suburbs we serve"
        >
          {allSuburbs.map((name) => (
            <li key={name} className="min-w-0">
              <span className={chipClass}>{name}</span>
            </li>
          ))}
        </ul>

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
