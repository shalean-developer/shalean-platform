import Link from "next/link";

/** Extra internal links for crawl depth on suburb hubs (server-rendered). */
export function MarketingHomePopularAreasSection() {
  return (
    <section
      className="border-t border-slate-100 bg-slate-50/60 py-10 sm:py-12"
      aria-labelledby="popular-areas-heading"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <h3 id="popular-areas-heading" className="text-base font-bold tracking-tight text-slate-900 sm:text-lg">
          Popular areas in Cape Town
        </h3>
        <nav className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm font-semibold text-blue-800" aria-label="Popular Cape Town suburbs">
          <Link href="/locations/claremont-cleaning-services" className="underline-offset-4 hover:underline">
            Claremont
          </Link>
          <span className="text-slate-300" aria-hidden>
            ·
          </span>
          <Link href="/locations/sea-point-cleaning-services" className="underline-offset-4 hover:underline">
            Sea Point
          </Link>
          <span className="text-slate-300" aria-hidden>
            ·
          </span>
          <Link href="/locations/observatory-cleaning-services" className="underline-offset-4 hover:underline">
            Observatory
          </Link>
        </nav>
      </div>
    </section>
  );
}
