import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { GrowthCtaLink } from "@/components/growth/GrowthCtaLink";
import type { HomeLocation } from "@/lib/home/data";
import { marketingHomeLocationHref } from "@/lib/marketing/homeLocationHref";
import { marketingHomeBookingHref } from "@/lib/marketing/marketingHomeAssets";
import { marketingPrimaryCtaClassName, marketingPrimaryCtaIconClassName } from "@/lib/marketing/marketingHomeCtaClasses";
import { linkInNavClassName, linkInParagraphClassName } from "@/lib/ui/linkClassNames";
import { cn } from "@/lib/utils";

type Props = {
  locations: HomeLocation[];
};

/** Areas we serve + visible suburb links for SEO. */
export function MarketingHomeLocationsSection({ locations }: Props) {
  const bookHref = marketingHomeBookingHref();

  return (
    <section id="locations" className="scroll-mt-24 border-t border-slate-100 bg-white py-16 md:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-8 lg:grid-cols-2 lg:items-start lg:gap-12 xl:gap-16">
          <div>
            <p className="text-sm font-medium tracking-wide text-slate-500">— Areas We Serve</p>
            <h2 className="mt-3 text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">
              Cape Town and surrounding suburbs
            </h2>
          </div>
          <div className="lg:pt-1">
            <p className="max-w-xl text-base leading-relaxed text-slate-600 lg:max-w-none">
              {locations.length > 0
                ? "We currently serve the areas below. Add your address at checkout to confirm availability for your home or office."
                : "We operate across Cape Town and surrounding suburbs — enter your address when you book to confirm we cover your area."}
            </p>
            <p className="mt-4 text-base leading-relaxed text-slate-600">
              Popular service areas include{" "}
              <Link href="/locations/claremont-cleaning-services" className={linkInParagraphClassName}>
                Claremont cleaning services
              </Link>{" "}
              and{" "}
              <Link href="/locations/sea-point-cleaning-services" className={linkInParagraphClassName}>
                Sea Point cleaning services
              </Link>
              . Browse all{" "}
              <Link href="/services" className={linkInParagraphClassName}>
                services
              </Link>{" "}
              or read the{" "}
              <Link href="/blog" className={linkInParagraphClassName}>
                blog
              </Link>
              .
            </p>
          </div>
        </div>

        {locations.length > 0 ? (
          <ul className="mt-12 flex flex-wrap gap-2.5 sm:mt-14 lg:mt-16">
            {locations.map((loc) => {
              const href = marketingHomeLocationHref(loc);
              const label = href ? `Cleaning services in ${loc.name}` : loc.city ? `${loc.name}, ${loc.city}` : loc.name;
              return (
                <li key={loc.id}>
                  {href ? (
                    <Link
                      href={href}
                      className={cn(
                        "inline-block rounded-xl border border-slate-100 bg-white px-4 py-2.5 text-sm shadow-sm transition-colors duration-200 hover:border-slate-200",
                        linkInNavClassName,
                      )}
                    >
                      {label}
                    </Link>
                  ) : (
                    <span className="inline-block rounded-xl border border-slate-100 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm">
                      {label}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        ) : null}

        <div className="mt-10 flex flex-wrap items-center gap-3 sm:mt-12">
          <GrowthCtaLink href={bookHref} source="marketing_locations_book" className={marketingPrimaryCtaClassName}>
            Book a cleaner
          </GrowthCtaLink>
          <GrowthCtaLink
            href={bookHref}
            source="marketing_locations_book_arrow"
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
