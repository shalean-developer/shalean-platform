"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut } from "@/lib/auth/authClient";
import { useAuth } from "@/lib/auth/useAuth";

export function GlobalTopNav() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const cleanerLoggedIn = typeof window !== "undefined" && Boolean(localStorage.getItem("cleaner_id"));

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

  return (
    <header className="sticky top-0 z-50 border-b border-zinc-200 bg-white/95 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link href="/" className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Shalean
        </Link>
        <div className="flex items-center gap-2 text-sm">
          {loading ? null : user || cleanerLoggedIn ? (
            <>
              <Link
                href={user ? "/account/bookings" : "/cleaner"}
                className="rounded-lg border border-zinc-300 px-3 py-1.5 text-zinc-700 dark:border-zinc-700 dark:text-zinc-200"
              >
                Dashboard
              </Link>
              <button
                type="button"
                onClick={() => void handleLogout()}
                className="rounded-lg bg-zinc-900 px-3 py-1.5 text-white dark:bg-zinc-100 dark:text-zinc-900"
              >
                Logout
              </button>
            </>
          ) : (
            <>
              <Link
                href="/login?role=customer"
                className="rounded-lg border border-zinc-300 px-3 py-1.5 text-zinc-700 dark:border-zinc-700 dark:text-zinc-200"
              >
                Login
              </Link>
              <Link href="/auth/signup" className="rounded-lg bg-emerald-600 px-3 py-1.5 text-white">
                Create account
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
