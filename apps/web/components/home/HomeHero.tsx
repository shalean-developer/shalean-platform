import { LiveBookingWidget } from "@/components/booking/LiveBookingWidget";
import { GrowthCtaLink } from "@/components/growth/GrowthCtaLink";
import { HomeHeroBookingPreview } from "@/components/home/HomeHeroBookingPreview";
import { cn } from "@/lib/utils";

const primaryCtaClass = cn(
  "inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-emerald-600 px-6 py-3 text-base font-semibold text-white shadow-md transition sm:w-auto",
  "hover:bg-emerald-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600",
  "dark:bg-emerald-600 dark:hover:bg-emerald-500",
);

const secondaryLinkClass = cn(
  "inline-flex min-h-12 w-full items-center justify-center rounded-xl border border-zinc-300 px-6 text-base font-semibold text-zinc-800 transition sm:w-auto",
  "hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-100 dark:hover:bg-zinc-900",
);

export function HomeHero() {
  return (
    <>
      <section
        className={cn(
          "relative overflow-hidden border-b border-zinc-200/80 bg-gradient-to-br from-zinc-50 via-white to-emerald-50/40",
          "dark:border-zinc-800 dark:from-zinc-950 dark:via-zinc-950 dark:to-emerald-950/20",
        )}
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.35] dark:opacity-20"
          aria-hidden
        >
          <div className="absolute -right-24 top-0 h-[28rem] w-[28rem] rotate-12 rounded-[3rem] border border-zinc-200/70 dark:border-zinc-700/60" />
          <div className="absolute -left-32 bottom-0 h-[22rem] w-[22rem] -rotate-6 rounded-[2.5rem] border border-emerald-200/50 dark:border-emerald-900/40" />
        </div>

        <div className="relative mx-auto max-w-6xl px-4 py-14 sm:py-16 lg:py-20">
          <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-14">
            <div className="max-w-xl">
              <h1 className="text-balance text-4xl font-bold leading-tight tracking-tight text-zinc-900 lg:text-5xl dark:text-zinc-50">
                Book trusted cleaners in minutes
              </h1>
              <p className="mt-4 max-w-lg text-pretty text-base leading-relaxed text-zinc-600 sm:text-lg dark:text-zinc-400">
                Choose your service, pick a time, and get a professional cleaner at your doorstep.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                <GrowthCtaLink href="#home-booking" source="home_hero_primary" className={primaryCtaClass}>
                  Get instant price
                </GrowthCtaLink>
                <a href="#how-it-works" className={secondaryLinkClass}>
                  How it works
                </a>
              </div>
            </div>

            <HomeHeroBookingPreview />
          </div>
        </div>
      </section>

      <section
        id="home-booking"
        className="scroll-mt-20 border-b border-zinc-200/80 bg-white py-12 sm:py-16 dark:border-zinc-800 dark:bg-zinc-950"
        aria-labelledby="home-booking-heading"
      >
        <div className="mx-auto max-w-6xl px-4">
          <div className="mx-auto mb-8 max-w-2xl text-center">
            <h2
              id="home-booking-heading"
              className="text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl dark:text-zinc-50"
            >
              Get your price and book
            </h2>
            <p className="mt-3 text-sm text-zinc-600 sm:text-base dark:text-zinc-400">
              Service, date, and time here — then we open the full booking flow with rooms and add-ons so your total
              is accurate before you pay.
            </p>
          </div>
          <div className="mx-auto w-full max-w-xl lg:max-w-2xl">
            <LiveBookingWidget source="home_hero" />
            <p className="mt-3 text-center text-xs text-zinc-500 dark:text-zinc-400">
              Starting estimate in the card above — this form confirms your slot and saves your choices for checkout.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
