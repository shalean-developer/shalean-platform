"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { CleanerEarningsDataProvider } from "@/components/cleaner/CleanerEarningsDataProvider";
import { CleanerLayoutWorkspaceHeader } from "@/components/cleaner/mobile/CleanerLayoutWorkspaceHeader";
import { getSupabaseBrowser } from "@/lib/supabase/browser";

export default function CleanerLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [checking, setChecking] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    const onLogin = pathname?.startsWith("/cleaner/login");
    if (onLogin) {
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
        <p className="text-sm text-zinc-600 dark:text-zinc-300">Checking cleaner access…</p>
      </main>
    );
  }

  const onLoginPage = pathname?.startsWith("/cleaner/login");
  const mobileShell = Boolean(pathname === "/cleaner" || pathname?.startsWith("/cleaner/job/"));

  if (!isLoggedIn && !onLoginPage) {
    const redirectPath = pathname || "/cleaner";
    return (
      <main className="mx-auto flex min-h-[55vh] w-full max-w-md items-center justify-center px-4">
        <div className="w-full rounded-2xl border border-zinc-200 bg-white p-6 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Cleaner login required</h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">Login to continue.</p>
          <Link
            href={`/cleaner/login?redirect=${encodeURIComponent(redirectPath)}`}
            className="mt-5 inline-flex w-full items-center justify-center rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
          >
            Login
          </Link>
        </div>
      </main>
    );
  }

  const sessionEarnings = isLoggedIn && !onLoginPage ? <CleanerEarningsDataProvider>{children}</CleanerEarningsDataProvider> : children;

  if (mobileShell || onLoginPage) {
    return <div className="min-h-dvh bg-zinc-50 dark:bg-zinc-950">{sessionEarnings}</div>;
  }

  return (
    <div className="min-h-dvh bg-zinc-50 dark:bg-zinc-950">
      <div className="sticky top-0 z-40">
        {isLoggedIn ? (
          <CleanerLayoutWorkspaceHeader />
        ) : (
          <header className="border-b border-zinc-200/90 bg-white dark:border-zinc-800 dark:bg-zinc-900">
            <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Shalean cleaner</p>
              <nav className="flex gap-4 text-sm font-medium">
                <Link href="/cleaner" className="text-blue-700 hover:underline dark:text-blue-400">
                  Workspace
                </Link>
                <Link href="/" className="text-zinc-600 dark:text-zinc-400">
                  Site
                </Link>
                <Link href="/cleaner/login" className="text-zinc-700 dark:text-zinc-300">
                  Login
                </Link>
              </nav>
            </div>
          </header>
        )}
      </div>
      {sessionEarnings}
    </div>
  );
}
