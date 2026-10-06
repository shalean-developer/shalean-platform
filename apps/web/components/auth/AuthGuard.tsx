"use client";

import { useRouter, usePathname } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth/useAuth";
import { scheduleAppRouterReplace } from "@/lib/navigation/scheduleAppRouterNavigation";

type Props = { children: React.ReactNode };

/**
 * Redirects unauthenticated customer-account users to the canonical login route,
 * preserving the current in-app pathname and query string.
 */
export function AuthGuard({ children }: Props) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (loading) return;
    if (user) return;

    const query =
      typeof window !== "undefined" ? window.location.search.replace(/^\?/, "") : "";
    const requested = `${pathname}${query ? `?${query}` : ""}`;
    scheduleAppRouterReplace(
      router,
      `/auth/login?redirect=${encodeURIComponent(requested)}&intent=customer`,
    );
  }, [loading, user, router, pathname]);

  if (loading) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 px-4">
        <div
          className="h-9 w-9 animate-spin rounded-full border-2 border-primary border-t-transparent"
          aria-hidden
        />
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Checking your session…</p>
      </div>
    );
  }

  if (!user) return null;

  return <>{children}</>;
}
