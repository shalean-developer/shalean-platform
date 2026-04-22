 "use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function CleanerLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    const onLoginPage = pathname?.startsWith("/cleaner/login");
    if (onLoginPage) {
      setChecking(false);
      setIsLoggedIn(false);
      return;
    }

    const cleanerId = typeof window !== "undefined" ? localStorage.getItem("cleaner_id") : null;
    if (!cleanerId) {
      setIsLoggedIn(false);
      setChecking(false);
      return;
    }
    setIsLoggedIn(true);
    setChecking(false);
  }, [pathname, router]);

  function handleCleanerLogout() {
    localStorage.removeItem("cleaner_id");
    router.push("/");
    router.refresh();
  }

  if (checking) {
    return (
      <main className="flex min-h-[45vh] items-center justify-center px-4">
        <p className="text-sm text-zinc-600 dark:text-zinc-300">Checking cleaner access…</p>
      </main>
    );
  }

  const onLoginPage = pathname?.startsWith("/cleaner/login");
  if (!isLoggedIn && !onLoginPage) {
    const redirectPath = pathname || "/cleaner";
    return (
      <main className="mx-auto flex min-h-[55vh] w-full max-w-md items-center justify-center px-4">
        <div className="w-full rounded-2xl border border-zinc-200 bg-white p-6 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Cleaner login required</h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">Login to continue.</p>
          <Link
            href={`/cleaner/login?redirect=${encodeURIComponent(redirectPath)}`}
            className="mt-5 inline-flex w-full items-center justify-center rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white"
          >
            Login
          </Link>
        </div>
      </main>
    );
  }

  return (
    <div className="min-h-dvh bg-zinc-50 dark:bg-zinc-950">
      <header className="sticky top-0 z-40 border-b border-zinc-200 bg-white/95 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/95">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Shalean cleaner</p>
          <nav className="flex gap-4 text-sm font-medium">
            <Link href="/cleaner/dashboard" className="text-emerald-700 dark:text-emerald-400">
              Dashboard
            </Link>
            <Link href="/cleaner/jobs" className="text-emerald-700 dark:text-emerald-400">
              Jobs
            </Link>
            <Link href="/" className="text-zinc-600 dark:text-zinc-400">
              Site
            </Link>
            {isLoggedIn ? (
              <button type="button" onClick={handleCleanerLogout} className="text-zinc-700 dark:text-zinc-300">
                Logout
              </button>
            ) : (
              <Link href="/cleaner/login" className="text-zinc-700 dark:text-zinc-300">
                Login
              </Link>
            )}
          </nav>
        </div>
      </header>
      {children}
    </div>
  );
}
