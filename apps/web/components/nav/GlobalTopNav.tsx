"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { signOut } from "@/lib/auth/authClient";
import { useAuth } from "@/lib/auth/useAuth";
import { GrowthCtaLink } from "@/components/growth/GrowthCtaLink";
import { cn } from "@/lib/utils";

const bookingHref = "/booking?step=entry";

function hashLink(hash: string, pathname: string) {
  return pathname === "/" ? hash : `/${hash}`;
}

export function GlobalTopNav() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const [open, setOpen] = useState(false);
  const [cleanerLoggedIn, setCleanerLoggedIn] = useState(false);

  useEffect(() => {
    setCleanerLoggedIn(typeof window !== "undefined" && Boolean(localStorage.getItem("cleaner_id")));
  }, []);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  /** Booking flow uses its own header (`BookingHeader`); avoid duplicate sticky navs. */
  const hideMarketingNav = pathname === "/booking" || pathname.startsWith("/booking/");

  async function handleLogout() {
    if (user) {
      await signOut();
    }
    if (typeof window !== "undefined") {
      localStorage.removeItem("cleaner_id");
    }
    router.push("/");
    router.refresh();
  }

  const navLinkClass = "rounded-lg px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-blue-50 hover:text-blue-700";

  if (hideMarketingNav) {
    return null;
  }

  return (
    <header className="sticky top-0 z-50 border-b border-blue-100 bg-white/95 shadow-sm backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="shrink-0 text-sm font-bold tracking-tight text-zinc-900 sm:text-base">
          <span className="hidden sm:inline">Shalean Cleaning Services</span>
          <span className="sm:hidden">Shalean</span>
        </Link>

        <nav className="hidden items-center gap-1 lg:flex" aria-label="Primary">
          <Link href={hashLink("#services", pathname)} className={navLinkClass}>
            Services
          </Link>
          <Link href={hashLink("#pricing", pathname)} className={navLinkClass}>
            Pricing
          </Link>
          <Link href={hashLink("#contact", pathname)} className={navLinkClass}>
            Contact
          </Link>
          <Link href={hashLink("#faq", pathname)} className={navLinkClass}>
            FAQ
          </Link>
        </nav>

        <div className="hidden items-center gap-2 lg:flex">
          {loading ? null : user || cleanerLoggedIn ? (
            <>
              <Link
                href={user ? "/account/bookings" : "/cleaner"}
                className="rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-800 transition hover:border-blue-200 hover:text-blue-700"
              >
                Dashboard
              </Link>
              <button
                type="button"
                onClick={() => void handleLogout()}
                className="rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-800 transition hover:border-blue-200"
              >
                Logout
              </button>
            </>
          ) : (
            <>
              <Link href="/login?role=customer" className="rounded-lg px-3 py-2 text-sm font-medium text-zinc-600 transition hover:text-blue-700">
                Login
              </Link>
              <GrowthCtaLink
                href={bookingHref}
                source="nav_book_now"
                className="inline-flex min-h-10 items-center rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
              >
                Book Now
              </GrowthCtaLink>
            </>
          )}
        </div>

        <button
          type="button"
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-blue-100 text-zinc-800 lg:hidden"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="mobile-nav"
          aria-label={open ? "Close menu" : "Open menu"}
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {open ? (
        <div id="mobile-nav" className="border-t border-blue-100 bg-white px-4 py-4 lg:hidden">
          <div className="flex flex-col gap-1">
            <Link href={hashLink("#services", pathname)} className={cn(navLinkClass, "w-full")}>
              Services
            </Link>
            <Link href={hashLink("#pricing", pathname)} className={cn(navLinkClass, "w-full")}>
              Pricing
            </Link>
            <Link href={hashLink("#contact", pathname)} className={cn(navLinkClass, "w-full")}>
              Contact
            </Link>
            <Link href={hashLink("#faq", pathname)} className={cn(navLinkClass, "w-full")}>
              FAQ
            </Link>
            {!loading && !(user || cleanerLoggedIn) ? (
              <>
                <Link href="/login?role=customer" className={cn(navLinkClass, "w-full")}>
                  Login
                </Link>
                <GrowthCtaLink
                  href={bookingHref}
                  source="nav_mobile_book"
                  className="mt-2 flex min-h-12 w-full items-center justify-center rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white"
                >
                  Book Now
                </GrowthCtaLink>
              </>
            ) : (
              <>
                <Link href={user ? "/account/bookings" : "/cleaner"} className={cn(navLinkClass, "w-full")}>
                  Dashboard
                </Link>
                <button type="button" onClick={() => void handleLogout()} className={cn(navLinkClass, "w-full text-left")}>
                  Logout
                </button>
              </>
            )}
          </div>
        </div>
      ) : null}
    </header>
  );
}
