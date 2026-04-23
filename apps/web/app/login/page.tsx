"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function RoleLoginRouterPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const role = (searchParams.get("role") ?? "customer").toLowerCase();
    const redirect = searchParams.get("redirect")?.trim() ?? "";
    const safeRedirect = redirect.startsWith("/") ? redirect : "";

    if (role === "cleaner") {
      const query = safeRedirect ? `?redirect=${encodeURIComponent(safeRedirect)}` : "";
      router.replace(`/cleaner/login${query}`);
      return;
    }

    if (role === "admin") {
      const adminRedirect = safeRedirect || "/admin";
      router.replace(`/auth/login?redirect=${encodeURIComponent(adminRedirect)}&role=admin`);
      return;
    }

    const customerRedirect = safeRedirect || "/dashboard/bookings";
    router.replace(`/auth/login?redirect=${encodeURIComponent(customerRedirect)}&role=customer`);
  }, [router, searchParams]);

  return (
    <main className="mx-auto flex min-h-[40vh] max-w-lg items-center justify-center px-4">
      <p className="text-sm text-zinc-600 dark:text-zinc-300">Redirecting to login…</p>
    </main>
  );
}

export default function RoleLoginRouterPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto flex min-h-[40vh] max-w-lg items-center justify-center px-4">
          <p className="text-sm text-zinc-600 dark:text-zinc-300">Redirecting to login…</p>
        </main>
      }
    >
      <RoleLoginRouterPageInner />
    </Suspense>
  );
}
