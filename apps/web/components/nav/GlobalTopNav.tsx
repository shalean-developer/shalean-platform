"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { Menu, X } from "lucide-react";
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
import { linkInNavClassName } from "@/lib/ui/linkClassNames";
import { cn } from "@/lib/utils";

const bookingHref = "/booking/details";

function hashLink(hash: string, pathname: string) {
  return pathname === "/" ? hash : `/${hash}`;
}

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

export function GlobalTopNav() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const [open, setOpen] = useState(false);
  const [cleanerLoggedIn, setCleanerLoggedIn] = useState(false);

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
    const timer = window.setTimeout(() => setOpen(false), 0);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  /** Booking flow uses its own header (`BookingHeader`); admin uses `app/admin/layout.tsx`. Cleaner app uses `app/cleaner/layout.tsx` (workspace bar on sub-routes, full shell on home/job). */
  const hideMarketingNav =
    pathname === "/" ||
    pathname.startsWith("/admin") ||
    pathname === "/booking" ||
    pathname.startsWith("/booking/") ||
    pathname === "/dashboard" ||
    pathname.startsWith("/dashboard/") ||
    pathname.startsWith("/cleaner");

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

  const navLinkClass = cn(
    "rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-200 hover:bg-blue-50/80",
    linkInNavClassName,
  );
  const loggedIn = Boolean(user || cleanerLoggedIn);
  const accountHref = user ? "/dashboard" : "/cleaner";
  const avatarName = user ? userDisplayName(user) : "Cleaner account";
  const avatarPhoto = user ? avatarImageUrl(user) : null;
  const avatarInitial = avatarLetter(user, cleanerLoggedIn);

  if (hideMarketingNav) {
    return null;
  }

  const accountMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="rounded-full outline-none transition hover:ring-2 hover:ring-blue-500/20 focus-visible:ring-2 focus-visible:ring-blue-500/40"
          aria-label="Account menu"
        >
          <Avatar className="h-10 w-10">
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
          <Link href={accountHref}>{user ? "Dashboard" : "Cleaner Dashboard"}</Link>
        </DropdownMenuItem>
        {user ? (
          <DropdownMenuItem asChild>
            <Link href="/dashboard/bookings">My Bookings</Link>
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
    <header className="sticky top-0 z-50 border-b border-blue-100 bg-white/95 shadow-sm backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="flex shrink-0 items-center" aria-label="Shalean home">
          <ShaleanNavLogo className="h-10 w-10" />
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
          {loading ? null : loggedIn ? (
            accountMenu
          ) : (
            <>
              <Link
                href="/login?role=customer"
                className="inline-flex min-h-10 items-center rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
              >
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

        <div className="flex items-center gap-2 lg:hidden">
          {!loading && loggedIn ? accountMenu : null}
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-blue-100 text-zinc-800"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? "Close menu" : "Open menu"}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
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
            {!loading && !loggedIn ? (
              <>
                <Link
                  href="/login?role=customer"
                  className="mt-2 flex min-h-12 w-full items-center justify-center rounded-xl border border-zinc-200 bg-white py-3 text-sm font-semibold text-zinc-700"
                >
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
              <Link href={accountHref} className={cn(navLinkClass, "w-full")}>
                {user ? "Dashboard" : "Cleaner Dashboard"}
              </Link>
            )}
          </div>
        </div>
      ) : null}
    </header>
  );
}
