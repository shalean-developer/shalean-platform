import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GrowthTracking } from "@/components/growth/GrowthTracking";
import { GrowthCtaLink } from "@/components/growth/GrowthCtaLink";
import { cityNameFromSlug, locationNameForCity, SERVICE_LOCATIONS } from "@/lib/growth/locations";

type Props = { params: Promise<{ city: string; location: string }> };

export function generateStaticParams() {
  return SERVICE_LOCATIONS.map((loc) => ({ city: loc.citySlug, location: loc.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { city, location } = await params;
  const cityName = cityNameFromSlug(city);
  const locationName = locationNameForCity(city, location);
  if (!cityName || !locationName) return { title: "Cleaning Services | Shalean" };
  return {
    title: `House Cleaning in ${locationName}, ${cityName} | Shalean`,
    description: `Book trusted house cleaning in ${locationName}, ${cityName}. Fast quotes, vetted cleaners, secure checkout.`,
  };
}

export default async function CityLocationCleaningPage({ params }: Props) {
  const { city, location } = await params;
  const cityName = cityNameFromSlug(city);
  const locationName = locationNameForCity(city, location);
  if (!cityName || !locationName) notFound();

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <GrowthTracking event="page_view" payload={{ page_type: "seo_city_location", city, location }} />

      <section className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h1 className="text-3xl font-semibold text-zinc-900 dark:text-zinc-50">
          House Cleaning in {locationName}, {cityName}
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-300">Trusted local cleaners. Book in 60 seconds.</p>
        <div className="pt-2">
          <GrowthCtaLink
            href="/booking?step=entry"
            source="seo_city_location_hero"
            className="inline-flex min-h-12 items-center rounded-lg bg-emerald-600 px-5 text-sm font-semibold text-white"
          >
            Get instant quote
          </GrowthCtaLink>
        </div>
      </section>

      <section className="mt-6 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-lg font-semibold">Why customers choose Shalean</h2>
        <ul className="mt-2 space-y-1 text-sm text-zinc-600 dark:text-zinc-300">
          <li>4.8★ average rating</li>
          <li>Secure payment</li>
          <li>Vetted cleaners in your city</li>
        </ul>
      </section>

      <section className="mt-6 flex flex-wrap gap-2 text-sm">
        {SERVICE_LOCATIONS.filter((loc) => loc.citySlug === city && loc.slug !== location).map((loc) => (
          <Link
            key={loc.slug}
            href={`/${city}/cleaning-services/${loc.slug}`}
            className="rounded-full border border-zinc-200 px-3 py-1 dark:border-zinc-700"
          >
            Cleaning in {loc.name}
          </Link>
        ))}
      </section>
    </main>
  );
}
