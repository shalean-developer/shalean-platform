"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthRoleChoiceScreen } from "@/components/auth/AuthRoleChoiceScreen";

function RoleLoginRouterPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const roleRaw = searchParams.get("role");
  const redirect = searchParams.get("redirect")?.trim() ?? "";
  const safeRedirect = redirect.startsWith("/") ? redirect : "";
  const roleNorm = (roleRaw ?? "").toLowerCase();
  const isKnownRole = roleNorm === "cleaner" || roleNorm === "admin" || roleNorm === "customer";

  useEffect(() => {
    if (!roleRaw || !isKnownRole) return;

    if (roleNorm === "cleaner") {
      const query = safeRedirect ? `?redirect=${encodeURIComponent(safeRedirect)}` : "";
      router.replace(`/cleaner/login${query}`);
      return;
    }

    if (roleNorm === "admin") {
      const adminRedirect = safeRedirect || "/admin";
      router.replace(`/auth/login?redirect=${encodeURIComponent(adminRedirect)}&role=admin`);
      return;
    }

    if (roleNorm === "customer") {
      const customerRedirect = safeRedirect || "/dashboard/bookings";
      router.replace(`/auth/login?redirect=${encodeURIComponent(customerRedirect)}&role=customer`);
    }
  }, [router, roleRaw, isKnownRole, roleNorm, safeRedirect]);

  if (!roleRaw || !isKnownRole) {
    return <AuthRoleChoiceScreen redirect={safeRedirect || null} />;
  }

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
