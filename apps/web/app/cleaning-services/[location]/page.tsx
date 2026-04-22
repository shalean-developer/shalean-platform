import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import dynamic from "next/dynamic";
import { SERVICE_LOCATIONS, locationNameFromSlug } from "@/lib/growth/locations";
import { GrowthTracking } from "@/components/growth/GrowthTracking";
import { GrowthCtaLink } from "@/components/growth/GrowthCtaLink";

type Props = { params: Promise<{ location: string }> };
const LocationContentSections = dynamic(
  () => import("@/components/growth/LocationContentSections").then((m) => m.LocationContentSections),
);

export function generateStaticParams() {
  return SERVICE_LOCATIONS.filter((loc) => loc.citySlug === "cape-town").map((loc) => ({ location: loc.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { location } = await params;
  const locationName = locationNameFromSlug(location);
  if (!locationName) return { title: "Cleaning Services | Shalean" };
  return {
    title: `House Cleaning in ${locationName} | Shalean`,
    description: `Book trusted house cleaning in ${locationName}. Fast quotes, vetted cleaners, secure checkout in 60 seconds.`,
  };
}

export default async function LocationCleaningPage({ params }: Props) {
  const { location } = await params;
  const locationName = locationNameFromSlug(location);
  if (!locationName) notFound();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: "Shalean Cleaning",
    areaServed: locationName,
    aggregateRating: { "@type": "AggregateRating", ratingValue: "4.8", reviewCount: "128" },
    url: `https://shalean.com/cleaning-services/${location}`,
    description: `Trusted cleaners in ${locationName}. Book in 60 seconds.`,
  };

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <GrowthTracking event="page_view" payload={{ page_type: "seo_location", location }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <section className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h1 className="text-3xl font-semibold text-zinc-900 dark:text-zinc-50">House Cleaning in {locationName}</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-300">Trusted cleaners near you. Book in 60 seconds.</p>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-zinc-100 px-3 py-1 dark:bg-zinc-800">Trusted by homeowners in Cape Town</span>
          <span className="rounded-full bg-zinc-100 px-3 py-1 dark:bg-zinc-800">4.8★ average rating</span>
          <span className="rounded-full bg-zinc-100 px-3 py-1 dark:bg-zinc-800">Secure payment</span>
        </div>
        <div className="pt-2">
          <GrowthCtaLink href="/booking?step=entry" source="seo_hero" className="inline-flex min-h-12 items-center rounded-lg bg-emerald-600 px-5 text-sm font-semibold text-white">
            Get your price
          </GrowthCtaLink>
        </div>
      </section>

      <section className="mt-6 grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-lg font-semibold">Services offered</h2>
          <ul className="mt-2 space-y-1 text-sm text-zinc-600 dark:text-zinc-300">
            <li>Standard cleaning</li>
            <li>Deep cleaning</li>
            <li>Move in/out cleaning</li>
            <li>Carpet cleaning</li>
          </ul>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-lg font-semibold">Why choose us</h2>
          <ul className="mt-2 space-y-1 text-sm text-zinc-600 dark:text-zinc-300">
            <li>Fast booking and clear pricing</li>
            <li>Reliable, vetted cleaners</li>
            <li>Live dispatch and support</li>
          </ul>
        </div>
      </section>

      <section className="mt-6 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-lg font-semibold">Pricing preview</h2>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">From R300 depending on home size, service type, and time slot.</p>
      </section>

      <LocationContentSections locationName={locationName} />

      <section className="mt-6 flex flex-wrap gap-2 text-sm">
        {SERVICE_LOCATIONS.filter((loc) => loc.citySlug === "cape-town" && loc.slug !== location).map((loc) => (
          <Link key={loc.slug} href={`/cleaning-services/${loc.slug}`} className="rounded-full border border-zinc-200 px-3 py-1 dark:border-zinc-700">
            Cleaning in {loc.name}
          </Link>
        ))}
      </section>

      <div className="fixed inset-x-0 bottom-3 z-40 mx-auto max-w-md px-4">
        <GrowthCtaLink href="/booking?step=entry" source="seo_sticky" className="flex min-h-12 items-center justify-center rounded-xl bg-emerald-600 text-sm font-semibold text-white shadow-lg">
          Get your price
        </GrowthCtaLink>
      </div>
    </main>
  );
}
