import { HomeBookingLink } from "@/components/home/HomeBookingLink";
import { HeroBookingWidgetCard } from "@/components/home/HeroBookingWidgetCard";
import { cn } from "@/lib/utils";
import Link from "next/link";

const outlineBtn =
  "inline-flex min-h-12 w-full items-center justify-center rounded-xl border-2 border-blue-200 bg-white px-6 py-3 text-base font-semibold text-blue-700 transition hover:border-blue-300 hover:bg-blue-50 sm:w-auto";

const primaryBtn =
  "inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-blue-600 px-6 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-blue-700 active:scale-[0.99] sm:w-auto";

export function HeroSection() {
  return (
    <section
      aria-labelledby="hero-heading"
      className="relative overflow-hidden border-b border-blue-100 bg-gradient-to-b from-blue-50/80 via-white to-white"
    >
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="absolute -right-24 top-0 h-80 w-80 rounded-full bg-blue-100/60 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-7xl px-4 py-14 sm:py-16 lg:py-20">
        <div className="grid items-start gap-10 lg:grid-cols-2 lg:gap-14">
          <div className="max-w-xl">
            <p className="text-sm font-semibold uppercase tracking-wide text-blue-600">Shalean Cleaning Services</p>
            <h1 id="hero-heading" className="mt-3 text-4xl font-bold leading-tight tracking-tight text-zinc-900 lg:text-5xl">
              Professional Home Cleaning in Cape Town
            </h1>
            <p className="mt-4 text-pretty text-lg text-gray-600">Trusted cleaners. Easy booking. Spotless results.</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <HomeBookingLink source="home_hero_primary" className={primaryBtn}>
                Book a Cleaning
              </HomeBookingLink>
              <Link href="#hero-booking" className={cn(outlineBtn, "text-center")}>
                Get Instant Price
              </Link>
            </div>
            <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-gray-600">
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                Live price before checkout
              </li>
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                Background-checked teams
              </li>
            </ul>
          </div>

          <HeroBookingWidgetCard />
        </div>
      </div>
    </section>
  );
}
