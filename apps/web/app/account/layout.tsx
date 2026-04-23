 "use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { signOut } from "@/lib/auth/authClient";
import { useAuth } from "@/lib/auth/useAuth";

export default function AccountLayout({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const router = useRouter();

  async function handleLogout() {
    await signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <AuthGuard>
      <div className="min-h-dvh bg-zinc-50 dark:bg-zinc-950">
        <header className="sticky top-0 z-40 border-b border-zinc-200 bg-white/95 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/95">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Customer account</p>
            <nav className="flex items-center gap-4 text-sm font-medium">
              {user ? (
                <>
                  <Link href="/dashboard/profile" className="text-blue-700 dark:text-blue-400">
                    Dashboard
                  </Link>
                  <button type="button" onClick={() => void handleLogout()} className="text-zinc-700 dark:text-zinc-300">
                    Logout
                  </button>
                </>
              ) : (
                <>
                  <Link href="/login?role=customer&redirect=/dashboard/bookings" className="text-zinc-700 dark:text-zinc-300">
                    Login
                  </Link>
                  <Link href="/auth/signup?redirect=/dashboard/bookings" className="text-blue-700 dark:text-blue-400">
                    Signup
                  </Link>
                </>
              )}
            </nav>
          </div>
        </header>
        {children}
      </div>
    </AuthGuard>
  );
}
