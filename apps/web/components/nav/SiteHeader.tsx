"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, CalendarDays, ChevronDown, Menu, X } from "lucide-react";
import { ShaleanNavLogo } from "@/components/brand/ShaleanNavLogo";
import { GrowthCtaLink } from "@/components/growth/GrowthCtaLink";
import { GetFreeQuoteLink } from "@/components/marketing/GetFreeQuoteLink";
import { MarketingMobileHeaderBookButton } from "@/components/marketing-home/MarketingMobileHeaderBookButton";
import { MarketingMobileServicesNav } from "@/components/marketing/MarketingMobileServicesNav";
import {
  MARKETING_HEADER_NAV_LINKS,
  MARKETING_HEADER_SERVICE_LINKS,
  marketingHeaderNavLinkClass,
} from "@/lib/marketing/marketingHomeHeaderNav";
import {
  marketingHeaderLogoImageClass,
  marketingHeaderLogoLinkClass,
  marketingMobileDrawerLinkClass,
  marketingMobileDrawerOpenPadding,
  marketingMobileHeaderActionsClass,
  marketingMobileMenuButtonClass,
} from "@/lib/marketing/marketingMobileLayout";
import { cn } from "@/lib/utils";

type SiteHeaderTrackingSources = {
  desktopQuote: string;
  desktopBook: string;
  mobileBook: string;
  mobileQuote: string;
};

type SiteHeaderProps = {
  bookingHref: string;
  mobileNavId: string;
  tracking: SiteHeaderTrackingSources;
  closeMenusOnPathChange?: boolean;
  desktopQuoteClassName?: string;
  logoPriority?: boolean;
};

export function SiteHeader({
  bookingHref,
  mobileNavId,
  tracking,
  closeMenusOnPathChange = false,
  desktopQuoteClassName,
  logoPriority = false,
}: SiteHeaderProps) {
  const pathname = usePathname() ?? "";
  const [mobileOpen, setMobileOpen] = useState(false);
  const [servicesOpen, setServicesOpen] = useState(false);
  const servicesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!closeMenusOnPathChange) return;

    const timer = window.setTimeout(() => {
      setMobileOpen(false);
      setServicesOpen(false);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [closeMenusOnPathChange, pathname]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (servicesRef.current && !servicesRef.current.contains(event.target as Node)) {
        setServicesOpen(false);
      }
    }

    if (servicesOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [servicesOpen]);

  return (
    <div className="bg-white/95 px-3 py-2 shadow-sm backdrop-blur sm:px-5">
      <div className="mx-auto flex w-full max-w-7xl items-center gap-3 lg:justify-between">
        <Link href="/" className={marketingHeaderLogoLinkClass} aria-label="Shalean home">
          <ShaleanNavLogo
            className={marketingHeaderLogoImageClass}
            intrinsicHeight={80}
            priority={logoPriority}
          />
        </Link>

        <nav className="hidden items-center gap-0.5 lg:flex" aria-label="Primary">
          {MARKETING_HEADER_NAV_LINKS.map(({ label, href, dropdown }) => {
            if (dropdown) {
              return (
                <div key={label} ref={servicesRef} className="relative">
                  <button
                    type="button"
                    className={cn(
                      marketingHeaderNavLinkClass,
                      servicesOpen && "bg-blue-50 text-blue-700",
                    )}
                    onClick={() => setServicesOpen((value) => !value)}
                    aria-expanded={servicesOpen}
                    suppressHydrationWarning
                  >
                    {label}
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 transition-transform duration-150",
                        servicesOpen && "rotate-180",
                      )}
                    />
                  </button>
                  <div
                    className={cn(
                      "absolute left-0 top-full z-50 mt-1.5 w-52 rounded-xl border border-blue-100 bg-white py-1.5 shadow-lg transition-[opacity,visibility] duration-150",
                      servicesOpen
                        ? "visible opacity-100"
                        : "invisible pointer-events-none opacity-0",
                    )}
                    aria-hidden={!servicesOpen}
                  >
                    {MARKETING_HEADER_SERVICE_LINKS.map(([item, itemHref]) => (
                      <Link
                        key={item}
                        href={itemHref}
                        className="block px-4 py-2 text-sm text-slate-700 hover:bg-blue-50 hover:text-blue-700"
                        onClick={() => setServicesOpen(false)}
                        tabIndex={servicesOpen ? 0 : -1}
                      >
                        {item}
                      </Link>
                    ))}
                  </div>
                </div>
              );
            }

            return (
              <Link key={label} href={href} className={marketingHeaderNavLinkClass}>
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          <GetFreeQuoteLink
            source={tracking.desktopQuote}
            variant="nav"
            className={desktopQuoteClassName}
          />
          <GrowthCtaLink
            href={bookingHref}
            source={tracking.desktopBook}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
          >
            <CalendarDays className="h-4 w-4" />
            Book Now
            <ArrowRight className="h-4 w-4" />
          </GrowthCtaLink>
        </div>

        <div className={marketingMobileHeaderActionsClass}>
          <MarketingMobileHeaderBookButton bookingHref={bookingHref} source={tracking.mobileBook} />
          <button
            type="button"
            className={marketingMobileMenuButtonClass}
            onClick={() => setMobileOpen((value) => !value)}
            aria-expanded={mobileOpen}
            aria-controls={mobileNavId}
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            suppressHydrationWarning
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      <div
        id={mobileNavId}
        className={cn(
          "border-t border-blue-100 bg-white shadow-md lg:hidden",
          mobileOpen
            ? cn("visible px-4 py-4 opacity-100", marketingMobileDrawerOpenPadding)
            : "invisible max-h-0 overflow-hidden opacity-0",
        )}
        aria-hidden={!mobileOpen}
      >
        <div className="flex flex-col gap-1">
          <GetFreeQuoteLink
            source={tracking.mobileQuote}
            variant="outline"
            className="mb-2 w-full"
          />
          {MARKETING_HEADER_NAV_LINKS.map(({ label, href, dropdown }) =>
            dropdown ? (
              <MarketingMobileServicesNav
                key={label}
                drawerOpen={mobileOpen}
                onNavigate={() => setMobileOpen(false)}
              />
            ) : (
              <Link
                key={label}
                href={href}
                className={marketingMobileDrawerLinkClass}
                onClick={() => setMobileOpen(false)}
                tabIndex={mobileOpen ? 0 : -1}
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
