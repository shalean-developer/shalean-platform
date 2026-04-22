import Link from "next/link";
import { SERVICE_LOCATIONS } from "@/lib/growth/locations";
import { GrowthTracking } from "@/components/growth/GrowthTracking";
import { GrowthCtaLink } from "@/components/growth/GrowthCtaLink";

export default function Home() {
  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <GrowthTracking event="page_view" payload={{ page_type: "home" }} />
      <section className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h1 className="text-3xl font-semibold text-zinc-900 dark:text-zinc-50">Shalean Cleaning</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-300">Trusted cleaners near you. Book in 60 seconds.</p>
        <div className="flex flex-wrap items-center gap-2">
          <GrowthCtaLink href="/booking?step=entry" source="home_primary" className="inline-flex min-h-12 items-center rounded-lg bg-emerald-600 px-5 text-sm font-semibold text-white">
            Get your price
          </GrowthCtaLink>
          <Link href="/login?role=customer&redirect=/account/bookings" className="inline-flex min-h-12 items-center rounded-lg border border-zinc-300 px-5 text-sm font-semibold text-zinc-700 dark:border-zinc-700 dark:text-zinc-200">
            Login
          </Link>
        </div>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Cleaning near you</h2>
        <div className="mt-3 flex flex-wrap gap-2 text-sm">
          {SERVICE_LOCATIONS.map((loc) => (
            <Link key={loc.slug} href={`/cleaning-services/${loc.slug}`} className="rounded-full border border-zinc-200 px-3 py-1 dark:border-zinc-700">
              House Cleaning in {loc.name}
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
