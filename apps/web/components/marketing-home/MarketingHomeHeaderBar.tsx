"use client";

import Link from "next/link";
import { useState } from "react";
import { CalendarDays, ArrowRight, Menu, X } from "lucide-react";
import { GetFreeQuoteLink } from "@/components/marketing/GetFreeQuoteLink";
import { MarketingMobileServicesNav } from "@/components/marketing/MarketingMobileServicesNav";
import { GrowthCtaLink } from "@/components/growth/GrowthCtaLink";
import { ShaleanNavLogo } from "@/components/brand/ShaleanNavLogo";
import { MarketingMobileHeaderBookButton } from "@/components/marketing-home/MarketingMobileHeaderBookButton";
import { MarketingHomeServicesDropdown } from "@/components/marketing-home/MarketingHomeServicesDropdown";
import {
  MARKETING_HEADER_NAV_LINKS,
  marketingHeaderNavLinkClass,
} from "@/lib/marketing/marketingHomeHeaderNav";
import {
  marketingHeaderLogoLinkClass,
  marketingHeaderLogoImageClass,
  marketingMobileDrawerLinkClass,
  marketingMobileDrawerOpenPadding,
  marketingMobileHeaderActionsClass,
  marketingMobileMenuButtonClass,
} from "@/lib/marketing/marketingMobileLayout";
import { cn } from "@/lib/utils";

type Props = {
  bookingHref: string;
};

export function MarketingHomeHeaderBar({ bookingHref }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className="bg-white/95 px-3 py-2 shadow-sm backdrop-blur sm:px-5">
      <div className="mx-auto flex w-full max-w-7xl items-center gap-3 lg:justify-between">
        <Link href="/" className={marketingHeaderLogoLinkClass} aria-label="Shalean home">
          <ShaleanNavLogo className={marketingHeaderLogoImageClass} intrinsicHeight={80} priority={false} />
        </Link>

        <nav className="hidden items-center gap-0.5 lg:flex" aria-label="Primary">
          <MarketingHomeServicesDropdown />
          {MARKETING_HEADER_NAV_LINKS.filter((link) => !link.dropdown).map(({ label, href }) => (
            <Link key={label} href={href} className={marketingHeaderNavLinkClass}>
              {label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          <GetFreeQuoteLink source="marketing_header" variant="nav" />
          <GrowthCtaLink
            href={bookingHref}
            source="marketing_header_book"
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
          >
            <CalendarDays className="h-4 w-4" />
            Book Now
            <ArrowRight className="h-4 w-4" />
          </GrowthCtaLink>
        </div>

        <div className={marketingMobileHeaderActionsClass}>
          <MarketingMobileHeaderBookButton bookingHref={bookingHref} source="marketing_header_mobile_book" />
          <button
            type="button"
            className={marketingMobileMenuButtonClass}
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            aria-controls="marketing-home-mobile-nav"
            onClick={() => setOpen((v) => !v)}
            suppressHydrationWarning
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Drawer sits below the bar — never a flex sibling of the logo */}
      <div
        id="marketing-home-mobile-nav"
        className={cn(
          "border-t border-blue-100 bg-white shadow-md lg:hidden",
          open
            ? cn("visible px-4 py-4 opacity-100", marketingMobileDrawerOpenPadding)
            : "invisible max-h-0 overflow-hidden opacity-0",
        )}
        aria-hidden={!open}
      >
        <div className="flex flex-col gap-1">
          <GetFreeQuoteLink source="marketing_mobile_menu" variant="outline" className="mb-2 w-full" />
          {MARKETING_HEADER_NAV_LINKS.map(({ label, href, dropdown }) =>
            dropdown ? (
              <MarketingMobileServicesNav
                key={label}
                drawerOpen={open}
                onNavigate={() => setOpen(false)}
              />
            ) : (
              <Link
                key={label}
                href={href}
                className={marketingMobileDrawerLinkClass}
                onClick={() => setOpen(false)}
                tabIndex={open ? 0 : -1}
              >
                {label}
              </Link>
            ),
          )}
        </div>
      </div>
    </div>
  );
}
