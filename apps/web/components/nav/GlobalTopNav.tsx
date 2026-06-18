"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { CalendarDays, ChevronDown, ArrowRight, Menu, Phone, X } from "lucide-react";
import { signOut } from "@/lib/auth/authClient";
import { useAuth } from "@/lib/auth/useAuth";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import { GrowthCtaLink } from "@/components/growth/GrowthCtaLink";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ShaleanNavLogo } from "@/components/brand/ShaleanNavLogo";
import { cn } from "@/lib/utils";
import { SiteTopBar } from "@/components/nav/SiteTopBar";
import { isAuthShellRoute } from "@/lib/auth/authShellRoutes";

const bookingHref = "/book";

function userDisplayName(user: User | null): string {
  const meta = user?.user_metadata as Record<string, unknown> | undefined;
  const name =
    (typeof meta?.full_name === "string" && meta.full_name.trim()) ||
    (typeof meta?.name === "string" && meta.name.trim()) ||
    "";
  return name || user?.email || "Account";
}

function avatarLetter(user: User | null, cleanerLoggedIn: boolean): string {
  if (cleanerLoggedIn && !user) return "C";
  const displayName = userDisplayName(user);
  return displayName.trim()[0]?.toUpperCase() ?? "S";
}

function avatarImageUrl(user: User | null): string | null {
  const meta = user?.user_metadata as Record<string, unknown> | undefined;
  const avatarUrl = meta?.avatar_url;
  const picture = meta?.picture;
  if (typeof avatarUrl === "string" && avatarUrl.startsWith("http")) return avatarUrl;
  if (typeof picture === "string" && picture.startsWith("http")) return picture;
  return null;
}

type NavLink = { label: string; href: string; dropdown?: boolean };

const navLinks: NavLink[] = [
  { label: "Services", href: "/services", dropdown: true },
  { label: "Pricing", href: bookingHref },
  { label: "About", href: "/about" },
  { label: "Help", href: "/faq" },
  { label: "Contact", href: "/contact" },
];

const navLinkClass =
  "flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 transition-colors duration-150 hover:bg-blue-50 hover:text-blue-700";

export function GlobalTopNav() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const [mobileOpen, setMobileOpen] = useState(false);
  const [servicesOpen, setServicesOpen] = useState(false);
  const [cleanerLoggedIn, setCleanerLoggedIn] = useState(false);
  const servicesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sb = getSupabaseBrowser();
    if (!sb) {
      setCleanerLoggedIn(false);
      return;
    }
    const sync = () => {
      void sb.auth.getSession().then(({ data }) => {
        setCleanerLoggedIn(Boolean(data.session?.access_token));
      });
    };
    sync();
    const { data: sub } = sb.auth.onAuthStateChange(() => sync());
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setMobileOpen(false);
      setServicesOpen(false);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (servicesRef.current && !servicesRef.current.contains(e.target as Node)) {
        setServicesOpen(false);
      }
    }
    if (servicesOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [servicesOpen]);

  /** Booking / admin / dashboard / cleaner / auth pages each own their header. */
  const hideMarketingNav =
    isAuthShellRoute(pathname) ||
    pathname === "/" ||
    pathname === "/about" ||
    pathname === "/faq" ||
    pathname === "/reviews" ||
    pathname.startsWith("/admin") ||
    pathname === "/book" ||
    pathname.startsWith("/book/") ||
    pathname === "/booking" ||
    pathname.startsWith("/booking/") ||
    pathname === "/dashboard" ||
    pathname.startsWith("/dashboard/") ||
    pathname.startsWith("/cleaner") ||
    pathname === "/account" ||
    pathname.startsWith("/account/") ||
    pathname === "/jobs" ||
    pathname.startsWith("/jobs/") ||
    pathname === "/office" ||
    pathname.startsWith("/office/");

  async function handleLogout() {
    if (user) await signOut();
    if (typeof window !== "undefined") localStorage.removeItem("cleaner_id");
    router.push("/");
    router.refresh();
  }

  const loggedIn = Boolean(user || cleanerLoggedIn);
  // New portal routes take priority; fallback to legacy routes during transition
  const accountHref = user ? "/account" : "/jobs";
  const avatarName = user ? userDisplayName(user) : "Cleaner account";
  const avatarPhoto = user ? avatarImageUrl(user) : null;
  const avatarInitial = avatarLetter(user, cleanerLoggedIn);

  if (hideMarketingNav) return null;

  const accountMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="rounded-full outline-none transition hover:ring-2 hover:ring-blue-500/20 focus-visible:ring-2 focus-visible:ring-blue-500/40"
          aria-label="Account menu"
        >
          <Avatar className="h-9 w-9">
            {avatarPhoto ? <AvatarImage src={avatarPhoto} alt="" referrerPolicy="no-referrer" /> : null}
            <AvatarFallback>{avatarInitial}</AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[220px]">
        <DropdownMenuLabel className="px-4">
          <span className="block truncate text-sm">{avatarName}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href={accountHref}>{user ? "My Account" : "Cleaner Workspace"}</Link>
        </DropdownMenuItem>
        {user ? (
          <DropdownMenuItem asChild>
            <Link href="/account/bookings">My Bookings</Link>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-red-600 focus:bg-red-50 focus:text-red-700"
          onSelect={(event) => {
            event.preventDefault();
            void handleLogout();
          }}
        >
          Logout
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <header className="sticky top-0 z-50">
      {/* Top info bar */}
      <SiteTopBar />

      {/* Main nav card */}
      <div className="bg-white/95 px-3 py-2 shadow-sm backdrop-blur sm:px-5">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          {/* Logo */}
          <Link href="/" className="flex shrink-0 items-center" aria-label="Shalean home">
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
            <a
              href="tel:0871535250"
              className="flex items-center gap-2 rounded-full border border-blue-600 px-4 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-50"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600">
                <Phone className="h-3.5 w-3.5 text-white" />
              </span>
              087 153 5250
            </a>

            {loading ? null : loggedIn ? (
              accountMenu
            ) : (
              <GrowthCtaLink
                href={bookingHref}
                source="nav_book_now"
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
              >
                <CalendarDays className="h-4 w-4" />
                Book Now
                <ArrowRight className="h-4 w-4" />
              </GrowthCtaLink>
            )}
          </div>

          {/* Mobile right */}
          <div className="flex items-center gap-2 lg:hidden">
            {!loading && loggedIn ? accountMenu : null}
            <a
              href="tel:0871535250"
              aria-label="Call us"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-600 text-white shadow-sm"
            >
              <Phone className="h-4 w-4" />
            </a>
            <GrowthCtaLink
              href={bookingHref}
              source="nav_mobile_book"
              className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white shadow-sm"
            >
              <CalendarDays className="h-3.5 w-3.5" />
              Book Now
            </GrowthCtaLink>
            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-blue-100 text-slate-700"
              onClick={() => setMobileOpen((v) => !v)}
              aria-expanded={mobileOpen}
              aria-controls="mobile-nav"
              aria-label={mobileOpen ? "Close menu" : "Open menu"}
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div id="mobile-nav" className="border-t border-blue-100 bg-white px-4 py-4 shadow-md lg:hidden">
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
            {!loading && !loggedIn ? null : (
              <Link
                href={accountHref}
                className="mt-1 rounded-lg px-3 py-3 text-sm font-medium text-slate-700 hover:bg-blue-50 hover:text-blue-700"
                onClick={() => setMobileOpen(false)}
              >
                {user ? "Dashboard" : "Cleaner Dashboard"}
              </Link>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
