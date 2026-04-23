"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useUser } from "@/hooks/useUser";
import { DashboardPageSkeleton } from "@/components/dashboard/dashboard-skeletons";

export function DashboardAuthGate({ children }: { children: ReactNode }) {
  const { user, loading } = useUser();
  const router = useRouter();
  const pathname = usePathname() ?? "/dashboard";

  useEffect(() => {
    if (loading) return;
    if (user) return;
    const next = encodeURIComponent(pathname);
    router.replace(`/login?role=customer&redirect=${next}`);
  }, [loading, user, router, pathname]);

  if (loading) {
    return <DashboardPageSkeleton />;
  }

  if (!user) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-zinc-50 px-4 dark:bg-zinc-950">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Redirecting to sign in…</p>
      </div>
    );
  }

  return <>{children}</>;
}
