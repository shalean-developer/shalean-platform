import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { GrowthCtaLink } from "@/components/growth/GrowthCtaLink";
import type { HomeLocation } from "@/lib/home/data";
import { marketingHomeLocationHref } from "@/lib/marketing/homeLocationHref";
import { marketingHomeBookingHref } from "@/lib/marketing/marketingHomeAssets";

type Props = {
  locations: HomeLocation[];
};

/** Areas we serve + visible suburb links for SEO. */
export function MarketingHomeLocationsSection({ locations }: Props) {
  const bookHref = marketingHomeBookingHref();

  return (
    <section id="locations" className="scroll-mt-24 border-t border-slate-100 bg-white py-16 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-8 lg:grid-cols-2 lg:items-start lg:gap-12 xl:gap-16">
          <div>
            <p className="text-sm font-medium tracking-wide text-slate-500">— Areas We Serve</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl lg:text-[2.35rem] lg:leading-[1.12]">
              Cape Town and surrounding suburbs
            </h2>
          </div>
          <div className="lg:pt-1">
            <p className="max-w-xl text-base leading-relaxed text-slate-600 sm:text-lg lg:max-w-none">
              {locations.length > 0
                ? "We currently serve the areas below. Add your address at checkout to confirm availability for your home or office."
                : "We operate across Cape Town and surrounding suburbs — enter your address when you book to confirm we cover your area."}
            </p>
            <p className="mt-4 text-sm leading-relaxed text-slate-600 sm:text-base">
              Popular service areas include{" "}
              <Link href="/locations/claremont-cleaning-services" className="font-semibold text-blue-700 underline-offset-2 hover:underline">
                Claremont cleaning services
              </Link>{" "}
              and{" "}
              <Link href="/locations/sea-point-cleaning-services" className="font-semibold text-blue-700 underline-offset-2 hover:underline">
                Sea Point cleaning services
              </Link>
              . Browse all{" "}
              <Link href="/services" className="font-semibold text-blue-700 underline-offset-2 hover:underline">
                services
              </Link>{" "}
              or read the{" "}
              <Link href="/blog" className="font-semibold text-blue-700 underline-offset-2 hover:underline">
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
              const label = loc.city ? `${loc.name}, ${loc.city}` : loc.name;
              return (
                <li key={loc.id}>
                  {href ? (
                    <Link
                      href={href}
                      className="inline-block rounded-xl border border-slate-200/90 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm ring-1 ring-black/[0.02] transition hover:border-blue-200 hover:text-blue-900"
                    >
                      {label}
                    </Link>
                  ) : (
                    <span className="inline-block rounded-xl border border-slate-200/90 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm ring-1 ring-black/[0.02]">
                      {label}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        ) : null}

        <div className="mt-10 flex flex-wrap items-center gap-2.5 sm:mt-12 md:gap-3">
          <GrowthCtaLink
            href={bookHref}
            source="marketing_locations_book"
            className="inline-flex h-12 shrink-0 items-center justify-center rounded-full bg-blue-600 px-7 text-sm font-semibold tracking-tight text-white shadow-[0_4px_16px_rgba(37,99,235,0.35)] transition-colors hover:bg-blue-700 md:h-14 md:px-9"
          >
            Check my area
          </GrowthCtaLink>
          <GrowthCtaLink
            href={bookHref}
            source="marketing_locations_book_arrow"
            className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white shadow-[0_4px_16px_rgba(37,99,235,0.35)] transition-colors hover:bg-blue-700 md:h-14 md:w-14"
          >
            <span className="sr-only">Book for your area</span>
            <ArrowUpRight size={20} strokeWidth={2.25} aria-hidden />
          </GrowthCtaLink>
        </div>
      </div>
    </section>
  );
}
