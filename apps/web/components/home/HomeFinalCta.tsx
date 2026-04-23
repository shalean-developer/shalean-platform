import { GrowthCtaLink } from "@/components/growth/GrowthCtaLink";
import { cn } from "@/lib/utils";

const btnClass = cn(
  "inline-flex min-h-14 w-full max-w-md items-center justify-center rounded-xl bg-white px-8 text-base font-bold text-emerald-800 shadow-md transition hover:bg-emerald-50 sm:w-auto dark:text-emerald-900 dark:hover:bg-zinc-100",
);

export function HomeFinalCta() {
  return (
    <section className="px-4 py-14 sm:py-20">
      <div className="mx-auto max-w-6xl">
        <div className="rounded-2xl bg-gradient-to-br from-emerald-600 to-emerald-800 px-6 py-12 text-center shadow-lg sm:px-12 sm:py-16 dark:from-emerald-700 dark:to-emerald-950">
          <h2 className="text-balance text-2xl font-bold tracking-tight text-white sm:text-3xl md:text-4xl">
            Ready for a cleaner home this week?
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-pretty text-base text-emerald-50 sm:text-lg">
            Join Cape Town households who trust Shalean for house cleaning — secure booking, vetted teams, and clear
            pricing before you pay.
          </p>
          <div className="mt-8 flex justify-center">
            <GrowthCtaLink href="/booking?step=entry" source="home_final_cta" className={btnClass}>
              Book Now
            </GrowthCtaLink>
          </div>
        </div>
      </div>
    </section>
  );
}
