"use client";

import { useRouter, usePathname } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth/useAuth";

type Props = { children: React.ReactNode };

/**
 * Redirects unauthenticated users to `/auth/login` with return URL.
 */
export function AuthGuard({ children }: Props) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (loading) return;
    if (user) return;

    router.replace(`/auth/login?redirect=${encodeURIComponent(pathname)}`);
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
