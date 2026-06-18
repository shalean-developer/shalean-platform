"use client";

import Link from "next/link";
import { useState, useRef, useEffect } from "react";
import { CalendarDays, ChevronDown, ArrowRight, Menu, Phone, X } from "lucide-react";
import { GrowthCtaLink } from "@/components/growth/GrowthCtaLink";
import { ShaleanNavLogo } from "@/components/brand/ShaleanNavLogo";
import { cn } from "@/lib/utils";
import { HeaderLoginButton } from "@/components/nav/HeaderLoginButton";
import { SiteTopBar } from "@/components/nav/SiteTopBar";

const MARKETING_NAV = {
  services: "/services",
  pricing: "/book",
  about: "/about",
  help: "/faq",
  contact: "/contact",
} as const;

type NavLink = { label: string; href: string; dropdown?: boolean };

const navLinks: NavLink[] = [
  { label: "Services", href: MARKETING_NAV.services, dropdown: true },
  { label: "Pricing", href: MARKETING_NAV.pricing },
  { label: "About", href: MARKETING_NAV.about },
  { label: "Help", href: MARKETING_NAV.help },
  { label: "Contact", href: MARKETING_NAV.contact },
];

const navLinkClass =
  "flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 transition-colors duration-150 hover:bg-blue-50 hover:text-blue-700";

export function MarketingHomeHeader({ bookingHref }: { bookingHref: string }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [servicesOpen, setServicesOpen] = useState(false);
  const servicesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (servicesRef.current && !servicesRef.current.contains(e.target as Node)) {
        setServicesOpen(false);
      }
    }
    if (servicesOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [servicesOpen]);

  return (
    <header className="sticky top-0 z-40">
      {/* Top info bar */}
      <SiteTopBar />

      {/* Main nav card */}
      <div className="bg-white/95 px-3 py-2 shadow-sm backdrop-blur sm:px-5">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          {/* Logo */}
          <Link
            href="/"
            className="flex shrink-0 items-center"
            aria-label="Shalean home"
          >
            <ShaleanNavLogo className="h-8 w-auto max-w-[140px] sm:h-10 sm:max-w-[168px]" />
          </Link>

          {/* Desktop nav */}
          <nav className="hidden items-center gap-0.5 lg:flex" aria-label="Primary">
            {navLinks.map(({ label, href, dropdown }) => {
              if (dropdown) {
                return (
                  <div key={label} ref={servicesRef} className="relative">
                    <button
                      type="button"
                      className={cn(navLinkClass, servicesOpen && "bg-blue-50 text-blue-700")}
                      onClick={() => setServicesOpen((v) => !v)}
                      aria-expanded={servicesOpen}
                    >
                      {label}
                      <ChevronDown
                        className={cn(
                          "h-4 w-4 transition-transform duration-150",
                          servicesOpen && "rotate-180",
                        )}
                      />
                    </button>
                    {servicesOpen && (
                      <div className="absolute left-0 top-full z-50 mt-1.5 w-52 rounded-xl border border-blue-100 bg-white py-1.5 shadow-lg">
                        {[
                          ["Standard Cleaning", "/services/standard-cleaning"],
                          ["Deep Cleaning", "/services/deep-cleaning"],
                          ["Move In / Out Cleaning", "/services/move-in-out-cleaning"],
                          ["Office Cleaning", "/services/office-cleaning"],
                          ["All Services", "/services"],
                        ].map(([item, itemHref]) => (
                          <Link
                            key={item}
                            href={itemHref}
                            className="block px-4 py-2 text-sm text-slate-700 hover:bg-blue-50 hover:text-blue-700"
                            onClick={() => setServicesOpen(false)}
                          >
                            {item}
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                );
              }
              return (
                <Link key={label} href={href} className={navLinkClass}>
                  {label}
                </Link>
              );
            })}
          </nav>

          {/* Desktop right CTAs */}
          <div className="hidden items-center gap-3 lg:flex">
            <HeaderLoginButton />

            <a
              href="tel:0871535250"
              className="flex items-center gap-2 rounded-full border border-blue-600 px-4 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-50"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600">
                <Phone className="h-3.5 w-3.5 text-white" />
              </span>
              087 153 5250
            </a>

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

          {/* Mobile right */}
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
              aria-label={mobileOpen ? "Close menu" : "Open menu"}
              onClick={() => setMobileOpen((o) => !o)}
              suppressHydrationWarning
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="border-t border-blue-100 bg-white px-4 py-4 shadow-md lg:hidden">
          <div className="flex flex-col gap-1">
            {navLinks.map(({ label, href }) => (
              <Link
                key={label}
                href={href}
                className="rounded-lg px-3 py-3 text-sm font-medium text-slate-700 hover:bg-blue-50 hover:text-blue-700"
                onClick={() => setMobileOpen(false)}
              >
                {label}
              </Link>
            ))}
            <div className="mt-2 border-t border-blue-100 pt-3">
              <HeaderLoginButton showLabel className="w-full justify-start" />
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
