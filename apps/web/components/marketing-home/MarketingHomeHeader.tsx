"use client";

import Link from "next/link";
import { Menu, X } from "lucide-react";
import { useState } from "react";
import { GrowthCtaLink } from "@/components/growth/GrowthCtaLink";
import { ShaleanNavLogo } from "@/components/brand/ShaleanNavLogo";
import { linkInNavClassName } from "@/lib/ui/linkClassNames";
import { marketingPrimaryCtaClassName } from "@/lib/marketing/marketingHomeCtaClasses";
import { cn } from "@/lib/utils";

/** Marketing header targets real routes (no hash URLs). */
const MARKETING_NAV = {
  services: "/services",
  locations: "/locations",
  cleaningPricesHub: "/cleaning-prices-cape-town",
  pricing: "/booking/details",
  about: "/about",
  faq: "/faq",
} as const;

const navClass = cn(
  "rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-200 hover:bg-blue-50/80",
  linkInNavClassName,
);

export function MarketingHomeHeader({ bookingHref }: { bookingHref: string }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-blue-100 bg-white/95 shadow-sm backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8 py-3 sm:py-3.5">
        <Link
          href="/"
          className="flex shrink-0 items-center rounded-lg px-1 py-0.5 transition hover:bg-blue-50/80"
          aria-label="Shalean home"
        >
          <ShaleanNavLogo className="h-8 w-auto max-w-[148px] sm:h-9 sm:max-w-[168px]" />
        </Link>

        <nav className="hidden items-center gap-1 lg:flex" aria-label="Primary">
          <Link href={MARKETING_NAV.services} className={navClass}>
            Services
          </Link>
          <Link href={MARKETING_NAV.locations} className={navClass}>
            Locations
          </Link>
          <Link
            href={MARKETING_NAV.cleaningPricesHub}
            className={navClass}
            title="Cleaning prices in Cape Town"
          >
            Cleaning prices
          </Link>
          <Link href={MARKETING_NAV.pricing} className={navClass}>
            Instant quote
          </Link>
          <Link href={MARKETING_NAV.about} className={navClass}>
            About Us
          </Link>
          <Link href={MARKETING_NAV.faq} className={navClass}>
            FAQs
          </Link>
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          <Link
            href="/login?role=customer"
            className="inline-flex min-h-10 items-center rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
          >
            Login
          </Link>
          <GrowthCtaLink
            href={bookingHref}
            source="marketing_header_book"
            className={cn(marketingPrimaryCtaClassName, "min-h-10 px-5 py-2 text-sm shadow-sm")}
          >
            Book a cleaner
          </GrowthCtaLink>
        </div>

        <button
          type="button"
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-blue-100 text-zinc-800 lg:hidden"
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
          onClick={() => setMobileOpen((o) => !o)}
          suppressHydrationWarning
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {mobileOpen ? (
        <div className="border-t border-blue-100 bg-white px-4 py-4 lg:hidden">
          <div className="flex flex-col gap-1">
            {(
              [
                ["Services", MARKETING_NAV.services],
                ["Locations", MARKETING_NAV.locations],
                ["Cleaning prices in Cape Town", MARKETING_NAV.cleaningPricesHub],
                ["Instant quote", MARKETING_NAV.pricing],
                ["About Us", MARKETING_NAV.about],
                ["FAQs", MARKETING_NAV.faq],
              ] as const
            ).map(([label, href]) => (
              <Link
                key={label}
                href={href}
                className={cn(navClass, "px-3 py-3")}
                onClick={() => setMobileOpen(false)}
              >
                {label}
              </Link>
            ))}
            <Link
              href="/login?role=customer"
              className="mt-2 rounded-xl border border-zinc-200 px-3 py-3 text-center text-sm font-semibold text-zinc-700 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
              onClick={() => setMobileOpen(false)}
            >
              Login
            </Link>
            <GrowthCtaLink
              href={bookingHref}
              source="marketing_header_mobile_book"
              className={cn(marketingPrimaryCtaClassName, "mt-2 w-full text-sm shadow-sm")}
            >
              Book a cleaner
            </GrowthCtaLink>
          </div>
        </div>
      ) : null}
    </header>
  );
}
