import type { Metadata } from "next";
import Link from "next/link";
import MarketingLayout from "@/components/marketing-home/MarketingLayout";
import { CAPE_TOWN_SERVICE_SEO } from "@/lib/seo/capeTownSeoPages";
import { PROGRAMMATIC_LOCATIONS } from "@/lib/seo/locations";
import { linkInParagraphClassName } from "@/lib/ui/linkClassNames";

const SITE = "https://www.shalean.co.za";
const PATH = "/locations";

export const metadata: Metadata = {
  title: "Cleaning Locations Cape Town | Find Your Suburb | Shalean",
  description:
    "Browse Shalean cleaning hubs across Cape Town suburbs—standard, deep, and move-out guides with booking links.",
  alternates: { canonical: PATH },
  openGraph: {
    type: "website",
    url: `${SITE}${PATH}`,
    title: "Cleaning Locations Cape Town | Find Your Suburb | Shalean",
    description:
      "Browse Shalean cleaning hubs across Cape Town suburbs—standard, deep, and move-out guides with booking links.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Cleaning Locations Cape Town | Find Your Suburb | Shalean",
    description:
      "Browse Shalean cleaning hubs across Cape Town suburbs—standard, deep, and move-out guides with booking links.",
  },
};

export default function LocationsIndexPage() {
  const linkClass = linkInParagraphClassName;

  return (
    <MarketingLayout>
      <article className="mx-auto max-w-3xl px-4 py-14 sm:px-6 lg:px-8 lg:py-16">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 lg:text-4xl">Cleaning services by location</h1>
        <p className="mt-4 text-base leading-relaxed text-slate-600">
          Pick a Cape Town suburb hub for local context, then book standard, deep, or move-out cleaning with instant
          pricing.
        </p>
        <ul className="mt-8 space-y-3 text-base">
          <li>
            <Link href="/locations/cape-town-cleaning-services" className={linkClass}>
              Cape Town overview &amp; popular suburbs
            </Link>
          </li>
          <li>
            <Link href="/services" className={linkClass}>
              All Cape Town cleaning service guides
            </Link>
          </li>
          <li>
            <Link href="/booking" className={linkClass}>
              Book now
            </Link>
          </li>
        </ul>
        <h2 className="mt-12 text-lg font-semibold text-slate-900">Suburb hubs</h2>
        <ul className="mt-4 flex flex-wrap gap-2">
          {PROGRAMMATIC_LOCATIONS.map((loc) => (
            <li key={loc.slug}>
              <Link
                href={`/locations/${loc.slug}`}
                className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:border-emerald-300 hover:text-emerald-900"
              >
                {loc.name}
              </Link>
            </li>
          ))}
        </ul>
        <p className="mt-10 text-sm text-slate-500">
          Popular guides:{" "}
          <Link href={CAPE_TOWN_SERVICE_SEO["standard-cleaning-cape-town"].path} className={linkClass}>
            Standard cleaning
          </Link>
          ,{" "}
          <Link href={CAPE_TOWN_SERVICE_SEO["deep-cleaning-cape-town"].path} className={linkClass}>
            Deep cleaning
          </Link>
          ,{" "}
          <Link href={CAPE_TOWN_SERVICE_SEO["move-out-cleaning-cape-town"].path} className={linkClass}>
            Move-out cleaning
          </Link>
          .
        </p>
      </article>
    </MarketingLayout>
  );
}
