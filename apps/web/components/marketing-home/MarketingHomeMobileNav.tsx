"use client";

import Link from "next/link";
import { useState } from "react";
import { CalendarDays, Menu, Phone, X } from "lucide-react";
import { GrowthCtaLink } from "@/components/growth/GrowthCtaLink";
import { HeaderLoginButton } from "@/components/nav/HeaderLoginButton";
import { MARKETING_HEADER_NAV_LINKS } from "@/lib/marketing/marketingHomeHeaderNav";

type Props = {
  bookingHref: string;
};

export function MarketingHomeMobileNav({ bookingHref }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="flex items-center gap-2 lg:hidden">
        <HeaderLoginButton />

        <a
          href="tel:0871535250"
          aria-label="Call us"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-600 text-white shadow-sm"
        >
          <Phone className="h-4 w-4" />
        </a>
        <GrowthCtaLink
          href={bookingHref}
          source="marketing_header_mobile_book"
          className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white shadow-sm"
        >
          <CalendarDays className="h-3.5 w-3.5" />
          Book Now
        </GrowthCtaLink>
        <button
          type="button"
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-blue-100 text-slate-700"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          suppressHydrationWarning
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {open ? (
        <div className="border-t border-blue-100 bg-white px-4 py-4 shadow-md lg:hidden">
          <div className="flex flex-col gap-1">
            {MARKETING_HEADER_NAV_LINKS.map(({ label, href }) => (
              <Link
                key={label}
                href={href}
                className="rounded-lg px-3 py-3 text-sm font-medium text-slate-700 hover:bg-blue-50 hover:text-blue-700"
                onClick={() => setOpen(false)}
              >
                {label}
              </Link>
            ))}
            <div className="mt-2 border-t border-blue-100 pt-3">
              <HeaderLoginButton showLabel className="w-full justify-start" />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
