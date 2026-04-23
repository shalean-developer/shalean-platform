"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo } from "react";
import type { User } from "@supabase/supabase-js";
import { BookingProgressBar } from "@/components/booking/BookingProgressBar";
import { linkBookingsToUserAfterAuth } from "@/lib/booking/clientLinkBookings";
import { signOut } from "@/lib/auth/authClient";
import { useAuth } from "@/lib/auth/useAuth";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import { useBookingFlow } from "@/components/booking/BookingFlowContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

function avatarLetter(user: User): string {
  const meta = user.user_metadata as Record<string, unknown> | undefined;
  const name =
    (typeof meta?.full_name === "string" && meta.full_name) ||
    (typeof meta?.name === "string" && meta.name) ||
    "";
  const fromName = name.trim().split(/\s+/)[0]?.[0];
  if (fromName) return fromName.toUpperCase();
  const em = user.email?.trim();
  if (em?.length) return em[0]!.toUpperCase();
  return "?";
}

function avatarImageUrl(user: User): string | null {
  const meta = user.user_metadata as Record<string, unknown> | undefined;
  const a = meta?.avatar_url;
  const p = meta?.picture;
  if (typeof a === "string" && a.startsWith("http")) return a;
  if (typeof p === "string" && p.startsWith("http")) return p;
  return null;
}

const menuContentClass = "min-w-[200px] rounded-xl border border-zinc-200 bg-white py-2 shadow-lg";

export function BookingHeader() {
  const { step, handleBack } = useBookingFlow();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user, loading } = useAuth();

  const redirectTarget = useMemo(() => {
    const q = searchParams.toString();
    return `${pathname}${q ? `?${q}` : ""}`;
  }, [pathname, searchParams]);

  const loginHref = `/auth/login?redirect=${encodeURIComponent(redirectTarget)}`;
  const signupHref = `/auth/signup?redirect=${encodeURIComponent(redirectTarget)}`;

  const linkBookings = useCallback(() => {
    if (!user) return;
    const sb = getSupabaseBrowser();
    void sb?.auth.getSession().then(({ data }) => {
      const t = data.session?.access_token;
      if (t && user) void linkBookingsToUserAfterAuth(t, user);
    });
  }, [user]);

  useEffect(() => {
    linkBookings();
  }, [linkBookings]);

  const initial = useMemo(() => (user ? avatarLetter(user) : null), [user]);
  const photo = useMemo(() => (user ? avatarImageUrl(user) : null), [user]);

  async function handleLogout() {
    await signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-50 border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <div className="mx-auto grid h-14 max-w-6xl grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 px-4">
        <div className="flex min-w-0 items-center justify-start">
          {step === "entry" ? (
            <Link
              href="/"
              className="mr-2 shrink-0 text-lg leading-none text-zinc-600 transition hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
              aria-label="Back to home"
            >
              ←
            </Link>
          ) : (
            <button
              type="button"
              onClick={handleBack}
              className="mr-2 shrink-0 text-lg leading-none text-zinc-600 transition hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
              aria-label="Go back"
            >
              ←
            </button>
          )}
          <Link
            href="/"
            className="truncate text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50"
          >
            Shalean<span className="text-blue-600">.</span>
          </Link>
        </div>

        <div className="flex shrink-0 justify-center px-1">
          <BookingProgressBar step={step} compact />
        </div>

        <div className="flex min-w-0 items-center justify-end">
          {loading ? (
            <div className="h-7 w-14 shrink-0 animate-pulse rounded-md bg-zinc-200 dark:bg-zinc-700" aria-hidden />
          ) : user && initial ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-zinc-200 bg-zinc-100 text-xs font-semibold text-zinc-800 transition",
                    "outline-none hover:border-blue-300 hover:ring-2 hover:ring-blue-500/20 focus-visible:ring-2 focus-visible:ring-blue-500/40",
                    "dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100",
                  )}
                  aria-label="Account menu"
                >
                  {photo ? (
                    <img src={photo} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    initial
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className={menuContentClass}>
                <DropdownMenuItem asChild className="cursor-pointer">
                  <Link href="/account/bookings">Dashboard</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild className="cursor-pointer">
                  <Link href="/account/bookings">My Bookings</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild className="cursor-pointer">
                  <Link href="/account/subscriptions">Profile</Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="cursor-pointer text-red-600 focus:bg-red-50 focus:text-red-700"
                  onSelect={(e) => {
                    e.preventDefault();
                    void handleLogout();
                  }}
                >
                  Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="text-sm font-medium text-blue-600 underline-offset-4 transition hover:text-blue-700 hover:underline focus-visible:outline focus-visible:ring-2 focus-visible:ring-blue-500/30 dark:text-blue-400 dark:hover:text-blue-300"
                >
                  Login
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className={menuContentClass}>
                <DropdownMenuItem asChild className="cursor-pointer">
                  <Link href={loginHref}>Login</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild className="cursor-pointer">
                  <Link href={signupHref}>Sign Up</Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
    </header>
  );
}

export default BookingHeader;
