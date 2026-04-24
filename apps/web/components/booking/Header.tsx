"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo } from "react";
import type { User } from "@supabase/supabase-js";
import { ProgressBar } from "@/components/booking/ProgressBar";
import { linkBookingsToUserAfterAuth } from "@/lib/booking/clientLinkBookings";
import { signOut } from "@/lib/auth/authClient";
import { useAuth } from "@/lib/auth/useAuth";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import { useBookingFlow } from "@/components/booking/BookingFlowContext";
import { BOOKING_FLOW_STEPS } from "@/lib/booking/bookingFlow";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LogIn } from "lucide-react";
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
  const { step } = useBookingFlow();
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

  const rawIndex = BOOKING_FLOW_STEPS.indexOf(step);
  const activeIndex = rawIndex === -1 ? 0 : rawIndex;
  const currentStepNumber = activeIndex + 1;

  async function handleLogout() {
    await signOut();
    router.push("/");
    router.refresh();
  }

  const authSlot = loading ? (
    <div className="h-7 w-14 shrink-0 animate-pulse rounded-md bg-gray-200" aria-hidden />
  ) : user && initial ? (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-gray-200 bg-gray-100 text-xs font-semibold text-gray-800 transition",
            "outline-none hover:border-blue-300 hover:ring-2 hover:ring-blue-500/20 focus-visible:ring-2 focus-visible:ring-blue-500/40",
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
          <Link href="/dashboard">Dashboard</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className="cursor-pointer">
          <Link href="/dashboard/bookings">My Bookings</Link>
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
          className="flex items-center gap-1.5 text-sm font-medium text-blue-600 underline-offset-4 transition hover:text-blue-700 hover:underline focus-visible:outline focus-visible:ring-2 focus-visible:ring-blue-500/30 dark:text-blue-400 dark:hover:text-blue-300"
        >
          <LogIn className="h-4 w-4 shrink-0 opacity-90" strokeWidth={2} aria-hidden />
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
  );

  return (
    <header className="sticky top-0 z-50 flex h-[80px] items-center border-b border-gray-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <div className="mx-auto flex w-full max-w-7xl items-center px-6">
        <div className="flex w-[160px] shrink-0 min-w-0 items-center justify-start">
          <Link
            href="/"
            className="min-w-0 truncate text-lg font-semibold tracking-tight text-gray-900 dark:text-zinc-50"
          >
            Shalean<span className="text-blue-600">.</span>
          </Link>
        </div>

        <div className="flex min-h-0 min-w-0 flex-1 items-center justify-center px-2 sm:px-4">
          <ProgressBar currentStep={currentStepNumber} className="max-w-2xl flex-1" />
        </div>

        <div className="flex w-[160px] shrink-0 items-center justify-end">{authSlot}</div>
      </div>
    </header>
  );
}

export default BookingHeader;
