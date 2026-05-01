import { GrowthTracking } from "@/components/growth/GrowthTracking";
import { GrowthCtaLink } from "@/components/growth/GrowthCtaLink";

export default function CleaningAdLandingPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl items-center px-4 py-8">
      <GrowthTracking event="page_view" payload={{ page_type: "google_ads_lp" }} />
      <section className="w-full space-y-4 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">Shalean Cleaning</p>
        <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">Book a trusted cleaner in 60 seconds</h1>
        <p className="text-lg font-semibold text-zinc-800 dark:text-zinc-200">From R300</p>
        <p className="text-sm text-zinc-600 dark:text-zinc-300">Trusted by homeowners in Cape Town • 4.8★ average rating • Secure payment</p>
        <GrowthCtaLink
          href="/booking/details"
          source="ads_lp_primary"
          className="flex min-h-12 w-full items-center justify-center rounded-lg bg-emerald-600 text-sm font-semibold text-white"
        >
          Get instant quote
        </GrowthCtaLink>
      </section>
    </main>
  );
}
