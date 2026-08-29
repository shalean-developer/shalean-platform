"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, CalendarDays, ChevronDown, Menu, Search, X } from "lucide-react";
import { ShaleanNavLogo } from "@/components/brand/ShaleanNavLogo";
import { GrowthCtaLink } from "@/components/growth/GrowthCtaLink";
import { GetFreeQuoteLink } from "@/components/marketing/GetFreeQuoteLink";
import { MarketingMobileHeaderBookButton } from "@/components/marketing-home/MarketingMobileHeaderBookButton";
import { MarketingMobileServicesNav } from "@/components/marketing/MarketingMobileServicesNav";
import { SiteTopBarAccount } from "@/components/nav/SiteTopBarAccount";
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
  actionMode?: "growth" | "auth";
  alignNavLeft?: boolean;
  visualMode?: "default" | "dribbble";
};

export function SiteHeader({
  bookingHref,
  mobileNavId,
  tracking,
  closeMenusOnPathChange = false,
  desktopQuoteClassName,
  logoPriority = false,
  actionMode = "growth",
  alignNavLeft = false,
  visualMode = "default",
}: SiteHeaderProps) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [servicesOpen, setServicesOpen] = useState(false);
  const [serviceSearchOpen, setServiceSearchOpen] = useState(false);
  const [serviceSearchQuery, setServiceSearchQuery] = useState("");
  const servicesRef = useRef<HTMLDivElement>(null);
  const serviceSearchRef = useRef<HTMLDivElement>(null);
  const authMode = actionMode === "auth";
  const dribbbleMode = visualMode === "dribbble";

  const filteredServices = useMemo(() => {
    const query = serviceSearchQuery.trim().toLowerCase();
    if (!query) return MARKETING_HEADER_SERVICE_LINKS.slice(0, 6);
    return MARKETING_HEADER_SERVICE_LINKS.filter(([label]) =>
      label.toLowerCase().includes(query),
    ).slice(0, 6);
  }, [serviceSearchQuery]);

  useEffect(() => {
    if (!closeMenusOnPathChange) return;

    const timer = window.setTimeout(() => {
      setMobileOpen(false);
      setServicesOpen(false);
      setServiceSearchOpen(false);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [closeMenusOnPathChange, pathname]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (servicesRef.current && !servicesRef.current.contains(target)) {
        setServicesOpen(false);
      }
      if (serviceSearchRef.current && !serviceSearchRef.current.contains(target)) {
        setServiceSearchOpen(false);
      }
    }

    if (servicesOpen || serviceSearchOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [servicesOpen, serviceSearchOpen]);

  function openService(href: string) {
    setServiceSearchOpen(false);
    setServiceSearchQuery("");
    setMobileOpen(false);
    router.push(href);
  }

  const navLinkClass = dribbbleMode
    ? "flex items-center gap-1 rounded-full px-3 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    : marketingHeaderNavLinkClass;

  return (
    <div
      className={cn(
        dribbbleMode
          ? "bg-background px-4 py-3 sm:px-6 lg:px-8"
          : "border-b border-border bg-background/95 px-3 py-2 shadow-[var(--ui-shadow-sm)] backdrop-blur sm:px-5",
      )}
    >
      <div
        className={cn(
          "mx-auto flex w-full max-w-[var(--ui-container-wide)] items-center gap-3",
          dribbbleMode ? "min-h-12" : alignNavLeft ? "lg:justify-start" : "lg:justify-between",
        )}
      >
        <div className={cn("flex min-w-0 items-center", dribbbleMode ? "gap-3 lg:gap-4" : "contents")}>
          <Link href="/" className={marketingHeaderLogoLinkClass} aria-label="Shalean home">
            <ShaleanNavLogo
              className={marketingHeaderLogoImageClass}
              intrinsicHeight={80}
              priority={logoPriority}
            />
          </Link>

          <nav
            className={cn(
              "hidden items-center lg:flex",
              dribbbleMode ? "gap-0.5" : "gap-0.5",
              !dribbbleMode && alignNavLeft && "lg:ml-2",
            )}
            aria-label="Primary"
          >
            {MARKETING_HEADER_NAV_LINKS.map(({ label, href, dropdown }) => {
              if (dropdown) {
                return (
                  <div key={label} ref={servicesRef} className="relative">
                    <button
                      type="button"
                      className={cn(
                        navLinkClass,
                        servicesOpen && (dribbbleMode ? "bg-muted" : "bg-accent text-accent-foreground"),
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
                        "absolute left-0 top-full z-50 mt-2 w-56 border border-border bg-popover py-2 text-popover-foreground shadow-[var(--ui-shadow-lg)] transition-[opacity,visibility] duration-150",
                        dribbbleMode ? "rounded-2xl" : "rounded-[var(--ui-radius-xl)]",
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
                          className={cn(
                            "block px-4 py-2 text-[length:var(--ui-text-small)] text-popover-foreground transition-colors",
                            dribbbleMode ? "mx-2 rounded-xl hover:bg-muted" : "hover:bg-accent hover:text-accent-foreground",
                          )}
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
                <Link key={label} href={href} className={navLinkClass}>
                  {label}
                </Link>
              );
            })}
          </nav>
        </div>

        {dribbbleMode ? (
          <div ref={serviceSearchRef} className="relative ml-auto hidden min-w-0 flex-1 xl:block xl:max-w-[430px]">
            <div className="flex h-12 items-center gap-3 rounded-full bg-muted/80 px-4 transition focus-within:bg-background focus-within:ring-2 focus-within:ring-ring">
              <Search className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
              <input
                type="search"
                value={serviceSearchQuery}
                onChange={(event) => {
                  setServiceSearchQuery(event.target.value);
                  setServiceSearchOpen(true);
                }}
                onFocus={() => setServiceSearchOpen(true)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") setServiceSearchOpen(false);
                  if (event.key === "Enter" && filteredServices[0]) {
                    event.preventDefault();
                    openService(filteredServices[0][1]);
                  }
                }}
                placeholder="Search cleaning services"
                className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
                aria-label="Search Shalean cleaning services"
                aria-expanded={serviceSearchOpen}
                aria-controls="shalean-header-service-search-results"
              />
              <span className="shrink-0 rounded-full bg-background px-3 py-1.5 text-xs font-semibold text-muted-foreground shadow-sm ring-1 ring-border">
                Services
              </span>
            </div>

            <div
              id="shalean-header-service-search-results"
              className={cn(
                "absolute left-0 right-0 top-full z-50 mt-2 rounded-2xl border border-border bg-popover p-2 shadow-[var(--ui-shadow-lg)] transition-[opacity,visibility] duration-150",
                serviceSearchOpen ? "visible opacity-100" : "invisible pointer-events-none opacity-0",
              )}
            >
              {filteredServices.length > 0 ? (
                filteredServices.map(([label, href]) => (
                  <button
                    key={label}
                    type="button"
                    className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm font-medium text-popover-foreground transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => openService(href)}
                  >
                    <span>{label}</span>
                    <span className="text-xs font-normal text-muted-foreground">Open</span>
                  </button>
                ))
              ) : (
                <p className="px-3 py-3 text-sm text-muted-foreground">No matching service.</p>
              )}
            </div>
          </div>
        ) : null}

        {authMode ? (
          <div className="ml-auto flex items-center gap-2">
            <SiteTopBarAccount variant="header" />
            <button
              type="button"
              className={cn(marketingMobileMenuButtonClass, dribbbleMode && "rounded-full", "lg:hidden")}
              onClick={() => setMobileOpen((value) => !value)}
              aria-expanded={mobileOpen}
              aria-controls={mobileNavId}
              aria-label={mobileOpen ? "Close menu" : "Open menu"}
              suppressHydrationWarning
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        ) : (
          <>
            <div className="hidden items-center gap-3 lg:flex">
              <GetFreeQuoteLink
                source={tracking.desktopQuote}
                variant="nav"
                className={desktopQuoteClassName}
              />
              <GrowthCtaLink
                href={bookingHref}
                source={tracking.desktopBook}
                className="inline-flex items-center gap-2 rounded-[var(--ui-radius-lg)] bg-primary px-[var(--ui-space-5)] py-[var(--ui-space-2)] text-[length:var(--ui-text-small)] font-semibold text-primary-foreground shadow-[var(--ui-shadow-sm)] transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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
          </>
        )}
      </div>

      <div
        id={mobileNavId}
        className={cn(
          "border-t border-border bg-background lg:hidden",
          dribbbleMode ? "mt-3 rounded-2xl shadow-[var(--ui-shadow-lg)]" : "shadow-[var(--ui-shadow-md)]",
          mobileOpen
            ? cn("visible px-4 py-4 opacity-100", marketingMobileDrawerOpenPadding)
            : "invisible max-h-0 overflow-hidden opacity-0",
        )}
        aria-hidden={!mobileOpen}
      >
        <div className="flex flex-col gap-1">
          {dribbbleMode ? (
            <div className="mb-3 rounded-full bg-muted/80 px-4 py-2.5">
              <div className="flex items-center gap-2">
                <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                <input
                  type="search"
                  value={serviceSearchQuery}
                  onChange={(event) => setServiceSearchQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && filteredServices[0]) {
                      event.preventDefault();
                      openService(filteredServices[0][1]);
                    }
                  }}
                  placeholder="Search services"
                  className="min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground"
                  aria-label="Search Shalean cleaning services"
                />
              </div>
            </div>
          ) : !authMode ? (
            <GetFreeQuoteLink
              source={tracking.mobileQuote}
              variant="outline"
              className="mb-2 w-full"
            />
          ) : null}

          {dribbbleMode && serviceSearchQuery.trim() ? (
            <div className="mb-2 rounded-2xl border border-border bg-popover p-2">
              {filteredServices.length > 0 ? (
                filteredServices.map(([label, href]) => (
                  <button
                    key={label}
                    type="button"
                    className="block w-full rounded-xl px-3 py-2.5 text-left text-sm font-medium text-popover-foreground hover:bg-muted"
                    onClick={() => openService(href)}
                  >
                    {label}
                  </button>
                ))
              ) : (
                <p className="px-3 py-2 text-sm text-muted-foreground">No matching service.</p>
              )}
            </div>
          ) : null}

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
