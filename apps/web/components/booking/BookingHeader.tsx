"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { type BookingFlowStep } from "@/lib/booking/bookingFlow";
import { BookingProgressBar } from "@/components/booking/BookingProgressBar";
import { linkBookingsToUserAfterAuth } from "@/lib/booking/clientLinkBookings";
import { signOut } from "@/lib/auth/authClient";
import { useAuth } from "@/lib/auth/useAuth";
import { getSupabaseBrowser } from "@/lib/supabase/browser";

type Props = {
  step: BookingFlowStep;
  onBack?: () => void;
};

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

export default function BookingHeader({ step, onBack }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user, loading } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const redirectTarget = useMemo(() => {
    const q = searchParams.toString();
    return `${pathname}${q ? `?${q}` : ""}`;
  }, [pathname, searchParams]);

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

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, []);

  const initial = useMemo(() => (user ? avatarLetter(user) : null), [user]);

  function handleLogin() {
    router.push(`/auth/login?redirect=${encodeURIComponent(redirectTarget)}`);
  }

  async function handleLogout() {
    setMenuOpen(false);
    await signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-50 border-b border-zinc-200/90 bg-white/95 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/95">
      <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-3 sm:gap-3">
        <div className="flex min-w-[100px] shrink-0 items-center gap-2 sm:min-w-[120px]">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="shrink-0 text-sm font-medium text-zinc-600 transition hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white"
              aria-label="Go back"
            >
              ←
            </button>
          ) : null}
          <Link
            href="/"
            className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50"
          >
            Shalean<span className="text-green-500">.</span>
          </Link>
        </div>

        <div className="min-w-0 flex-1 px-1 sm:px-4">
          <BookingProgressBar step={step} />
        </div>

        <div className="flex w-[88px] shrink-0 items-center justify-end sm:w-[140px]">
          {loading ? (
            <div className="h-8 w-8 shrink-0 animate-pulse rounded-full bg-zinc-200 dark:bg-zinc-700" aria-hidden />
          ) : user && initial ? (
            <div className="relative flex items-center gap-2" ref={menuRef}>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen((o) => !o);
                }}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-sm font-medium text-zinc-800 ring-2 ring-transparent transition hover:ring-primary/30 dark:bg-zinc-700 dark:text-zinc-100"
                title={user.email ?? "Account"}
                aria-expanded={menuOpen}
                aria-haspopup="menu"
              >
                {initial}
              </button>
              {menuOpen ? (
                <div
                  role="menu"
                  className="absolute right-0 top-full z-50 mt-2 min-w-[200px] rounded-xl border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
                >
                  <Link
                    href="/account/bookings"
                    role="menuitem"
                    className="block px-4 py-2.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50 dark:text-zinc-100 dark:hover:bg-zinc-800"
                    onClick={() => setMenuOpen(false)}
                  >
                    My bookings
                  </Link>
                  <button
                    type="button"
                    role="menuitem"
                    className="w-full px-4 py-2.5 text-left text-sm font-medium text-zinc-800 hover:bg-zinc-50 dark:text-zinc-100 dark:hover:bg-zinc-800"
                    onClick={() => void handleLogout()}
                  >
                    Log out
                  </button>
                </div>
              ) : null}
            </div>
          ) : (
            <button
              type="button"
              onClick={handleLogin}
              className="rounded-lg px-2 py-1.5 text-xs font-semibold text-blue-600 transition hover:bg-blue-50 sm:px-3 sm:text-sm dark:text-blue-400 dark:hover:bg-blue-950/40"
            >
              Login
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
