"use client";

import Link from "next/link";
import { useState } from "react";
import { CalendarDays, Menu, X } from "lucide-react";
import { GetFreeQuoteLink } from "@/components/marketing/GetFreeQuoteLink";
import { GrowthCtaLink } from "@/components/growth/GrowthCtaLink";
import {
  MARKETING_HEADER_NAV_LINKS,
  MARKETING_HEADER_SERVICE_LINKS,
} from "@/lib/marketing/marketingHomeHeaderNav";
import { cn } from "@/lib/utils";

type Props = {
  bookingHref: string;
};

export function MarketingHomeMobileNav({ bookingHref }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="flex items-center gap-2 lg:hidden">
        <GetFreeQuoteLink source="marketing_header_mobile" variant="navCompact" className="hidden min-[400px]:inline-flex" />
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

      <div
        className={cn(
          "border-t border-blue-100 bg-white shadow-md lg:hidden",
          open ? "visible px-4 py-4 opacity-100" : "invisible max-h-0 overflow-hidden opacity-0",
        )}
        aria-hidden={!open}
      >
        <div className="flex flex-col gap-1">
          <GetFreeQuoteLink source="marketing_mobile_menu" variant="outline" className="mb-2 w-full" />
          {MARKETING_HEADER_NAV_LINKS.map(({ label, href, dropdown }) => (
            <div key={label}>
              <Link
                href={href}
                className="block rounded-lg px-3 py-3 text-sm font-medium text-slate-700 hover:bg-blue-50 hover:text-blue-700"
                onClick={() => setOpen(false)}
                tabIndex={open ? 0 : -1}
              >
                {label}
              </Link>
              {dropdown ? (
                <div className="ml-3 border-l border-blue-100 pl-2">
                  {MARKETING_HEADER_SERVICE_LINKS.map(([item, itemHref]) => (
                    <Link
                      key={item}
                      href={itemHref}
                      className="block rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-blue-50 hover:text-blue-700"
                      onClick={() => setOpen(false)}
                      tabIndex={open ? 0 : -1}
                    >
                      {item}
                    </Link>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
