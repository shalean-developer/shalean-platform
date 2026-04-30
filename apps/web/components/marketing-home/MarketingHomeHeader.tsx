"use client";

import Link from "next/link";
import { Menu, X } from "lucide-react";
import { useState } from "react";
import { GrowthCtaLink } from "@/components/growth/GrowthCtaLink";
import { ShaleanNavLogo } from "@/components/brand/ShaleanNavLogo";

function hash(h: string) {
  return `/${h}`;
}

const navClass =
  "rounded-lg px-3 py-2 text-sm font-medium text-white/90 transition hover:bg-white/10 hover:text-white";

export function MarketingHomeHeader({ bookingHref }: { bookingHref: string }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-blue-900/25 bg-[#1e4fd4] shadow-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:py-3.5">
        <Link
          href="/"
          className="flex shrink-0 items-center rounded-lg px-1 py-0.5 transition hover:bg-white/10"
          aria-label="Shalean home"
        >
          <ShaleanNavLogo className="h-10 w-10" />
        </Link>

        <nav className="hidden items-center gap-1 lg:flex" aria-label="Primary">
          <Link href={hash("#services")} className={navClass}>
            Services
          </Link>
          <Link href={hash("#locations")} className={navClass}>
            Locations
          </Link>
          <Link href={hash("#pricing")} className={navClass}>
            Pricing
          </Link>
          <Link href={hash("#about")} className={navClass}>
            About Us
          </Link>
          <Link href={hash("#faq")} className={navClass}>
            FAQs
          </Link>
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          <Link
            href="/login?role=customer"
            className="text-sm font-semibold text-white/90 underline-offset-4 hover:text-white hover:underline"
          >
            Login
          </Link>
          <GrowthCtaLink
            href={bookingHref}
            source="marketing_header_book"
            className="inline-flex min-h-10 items-center rounded-xl bg-white px-5 py-2 text-sm font-semibold text-[#1e4fd4] shadow-sm transition hover:bg-blue-50"
          >
            Book now
          </GrowthCtaLink>
        </div>

        <button
          type="button"
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/20 text-white lg:hidden"
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
          onClick={() => setMobileOpen((o) => !o)}
          suppressHydrationWarning
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {mobileOpen ? (
        <div className="border-t border-white/10 px-4 py-4 lg:hidden">
          <div className="flex flex-col gap-1">
            {(
              [
                ["Services", hash("#services")],
                ["Locations", hash("#locations")],
                ["Pricing", hash("#pricing")],
                ["About Us", hash("#about")],
                ["FAQs", hash("#faq")],
              ] as const
            ).map(([label, href]) => (
              <Link
                key={label}
                href={href}
                className="rounded-lg px-3 py-3 text-sm font-medium text-white/95 hover:bg-white/10"
                onClick={() => setMobileOpen(false)}
              >
                {label}
              </Link>
            ))}
            <Link
              href="/login?role=customer"
              className="mt-2 rounded-xl border border-white/25 px-3 py-3 text-center text-sm font-semibold text-white"
              onClick={() => setMobileOpen(false)}
            >
              Login
            </Link>
            <GrowthCtaLink
              href={bookingHref}
              source="marketing_header_mobile_book"
              className="mt-2 flex min-h-12 items-center justify-center rounded-xl bg-white py-3 text-sm font-semibold text-[#1e4fd4] transition hover:bg-blue-50"
            >
              Book now
            </GrowthCtaLink>
          </div>
        </div>
      ) : null}
    </header>
  );
}
