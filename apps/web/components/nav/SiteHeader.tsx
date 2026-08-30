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

const SERVICE_MENU_DETAILS: Record<string, string> = {
  "Standard Cleaning": "Reliable recurring or once-off home cleaning.",
  "Deep Cleaning": "A more detailed top-to-bottom clean.",
  "Move In / Out Cleaning": "Prepare a home for moving day or handover.",
  "Office Cleaning": "Professional cleaning for workplaces and teams.",
  "Airbnb Cleaning": "Fast, guest-ready turnover cleaning.",
  "Carpet Cleaning": "Refresh carpets and soft floor surfaces.",
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

  const primaryServiceLinks = MARKETING_HEADER_SERVICE_LINKS.slice(0, 6);
  const windowCleaningLink = MARKETING_HEADER_SERVICE_LINKS.find(
    ([label]) => label === "Window Cleaning",
  );
  const allServicesLink = MARKETING_HEADER_SERVICE_LINKS.find(
    ([label]) => label === "All Services",
  );

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

                    {dribbbleMode ? (
                      <div
                        className={cn(
                          "absolute left-0 top-full z-50 mt-3 w-[640px] overflow-hidden rounded-[28px] bg-popover text-popover-foreground shadow-[0_24px_70px_rgba(0,0,0,0.16)] ring-1 ring-black/5 transition-[opacity,visibility,transform] duration-150",
                          servicesOpen
                            ? "visible translate-y-0 opacity-100"
                            : "invisible pointer-events-none -translate-y-1 opacity-0",
                        )}
                        aria-hidden={!servicesOpen}
                      >
                        <div className="grid grid-cols-[220px_minmax(0,1fr)] gap-2 p-2">
                          <div className="flex flex-col rounded-[22px] bg-muted p-5">
                            <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
                              Cleaning services
                            </p>
                            <h3 className="mt-3 text-xl font-bold leading-tight text-foreground">
                              Find the right clean for your space.
                            </h3>
                            <p className="mt-3 text-sm leading-6 text-muted-foreground">
                              Compare the main Shalean cleaning options and choose the service that fits your home, move, stay or workplace.
                            </p>
                            <div className="mt-4 space-y-2 text-sm text-foreground">
                              <p>See the right service faster</p>
                              <p>Understand each cleaning type</p>
                              <p>Continue to canonical service pages</p>
                            </div>

                            {allServicesLink ? (
                              <Link
                                href={allServicesLink[1]}
                                className="mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-foreground px-4 py-2.5 text-sm font-semibold text-background transition hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                onClick={() => setServicesOpen(false)}
                                tabIndex={servicesOpen ? 0 : -1}
                              >
                                View all services
                                <ArrowRight className="h-4 w-4" aria-hidden />
                              </Link>
                            ) : null}
                          </div>

                          <div className="p-3">
                            <div className="flex items-center justify-between gap-4 px-2 pb-2">
                              <div>
                                <p className="text-sm font-bold text-foreground">Popular services</p>
                                <p className="mt-0.5 text-xs text-muted-foreground">Choose one to see service details.</p>
                              </div>
                              <span className="rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground">
                                6 primary
                              </span>
                            </div>

                            <div className="mt-1 grid grid-cols-2 gap-1">
                              {primaryServiceLinks.map(([item, itemHref]) => (
                                <Link
                                  key={item}
                                  href={itemHref}
                                  className="group rounded-2xl px-3 py-3 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                  onClick={() => setServicesOpen(false)}
                                  tabIndex={servicesOpen ? 0 : -1}
                                >
                                  <span className="flex items-center justify-between gap-2 text-sm font-semibold text-foreground">
                                    {item}
                                    <ArrowRight className="h-3.5 w-3.5 -translate-x-1 opacity-0 transition group-hover:translate-x-0 group-hover:opacity-100" aria-hidden />
                                  </span>
                                  <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                                    {SERVICE_MENU_DETAILS[item] ?? "Explore this cleaning service."}
                                  </span>
                                </Link>
                              ))}
                            </div>

                            {windowCleaningLink ? (
                              <div className="mt-3 border-t border-border pt-3">
                                <Link
                                  href={windowCleaningLink[1]}
                                  className="flex items-center justify-between rounded-2xl px-3 py-2.5 text-sm transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                  onClick={() => setServicesOpen(false)}
                                  tabIndex={servicesOpen ? 0 : -1}
                                >
                                  <span>
                                    <span className="font-semibold text-foreground">Window Cleaning</span>
                                    <span className="ml-2 text-xs text-muted-foreground">Additional cleaning service</span>
                                  </span>
                                  <ArrowRight className="h-4 w-4 text-muted-foreground" aria-hidden />
                                </Link>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div
                        className={cn(
                          "absolute left-0 top-full z-50 mt-2 w-56 rounded-[var(--ui-radius-xl)] border border-border bg-popover py-2 text-popover-foreground shadow-[var(--ui-shadow-lg)] transition-[opacity,visibility] duration-150",
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
                            className="block px-4 py-2 text-[length:var(--ui-text-small)] text-popover-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                            onClick={() => setServicesOpen(false)}
                            tabIndex={servicesOpen ? 0 : -1}
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
