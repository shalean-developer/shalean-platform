"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import { CleanerBottomNav } from "./CleanerBottomNav";
import { CleanerNavBadgesProvider } from "./CleanerNavBadgesContext";

const PUBLIC_PREFIXES = ["/cleaner/login", "/cleaner/apply"] as const;

function isPublicCleanerPath(pathname: string | null) {
  if (!pathname) return false;
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function CleanerRouteShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [checking, setChecking] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    if (isPublicCleanerPath(pathname)) {
      setIsLoggedIn(false);
      setChecking(false);
      return;
    }

    const sb = getSupabaseBrowser();
    if (!sb) {
      setIsLoggedIn(false);
      setChecking(false);
      return;
    }

    const sync = () => {
      void sb.auth.getSession().then(({ data }) => {
        setIsLoggedIn(Boolean(data.session?.access_token));
        setChecking(false);
      });
    };
    sync();
    const { data: sub } = sb.auth.onAuthStateChange(() => {
      sync();
    });
    return () => sub.subscription.unsubscribe();
  }, [pathname]);

  if (checking) {
    return (
      <main className="flex min-h-[45vh] items-center justify-center px-4">
        <p className="text-sm text-muted-foreground">Checking cleaner access…</p>
      </main>
    );
  }

  const onPublicPage = isPublicCleanerPath(pathname);

  if (!isLoggedIn && !onPublicPage) {
    const redirectPath = pathname || "/cleaner/dashboard";
    return (
      <main className="mx-auto flex min-h-[55vh] w-full max-w-md items-center justify-center px-4">
        <div className="w-full rounded-2xl border border-border bg-card p-6 text-center shadow-sm">
          <h1 className="text-lg font-semibold text-foreground">Cleaner login required</h1>
          <p className="mt-2 text-sm text-muted-foreground">Sign in to open your dashboard.</p>
          <Link
            href={`/cleaner/login?redirect=${encodeURIComponent(redirectPath)}`}
            className="mt-5 inline-flex w-full items-center justify-center rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-90"
          >
            Login
          </Link>
        </div>
      </main>
    );
  }

  const showBottomNav = isLoggedIn && !onPublicPage;

  return (
    <div className="min-h-dvh bg-muted/30">
      <CleanerNavBadgesProvider>
        <div className={showBottomNav ? "pb-[calc(4.25rem+env(safe-area-inset-bottom))]" : ""}>{children}</div>
        {showBottomNav ? <CleanerBottomNav /> : null}
      </CleanerNavBadgesProvider>
    </div>
  );
}
