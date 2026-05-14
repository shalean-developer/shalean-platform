"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthRoleChoiceScreen } from "@/components/auth/AuthRoleChoiceScreen";

function RedirectingMessage() {
  return (
    <main className="mx-auto flex min-h-[40vh] max-w-lg items-center justify-center px-4">
      <p className="text-sm text-zinc-600 dark:text-zinc-300">
        Redirecting to login…
      </p>
    </main>
  );
}

function RoleLoginRouterPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const roleRaw = searchParams.get("role");
  const redirect = searchParams.get("redirect")?.trim() ?? "";
  const safeRedirect = redirect.startsWith("/") ? redirect : "";
  const roleNorm = (roleRaw ?? "").toLowerCase();

  const isKnownRole =
    roleNorm === "cleaner" ||
    roleNorm === "admin" ||
    roleNorm === "customer";

  useEffect(() => {
    if (!roleRaw || !isKnownRole) return;

    if (roleNorm === "cleaner") {
      const query = safeRedirect
        ? `?redirect=${encodeURIComponent(safeRedirect)}`
        : "";

      router.replace(`/cleaner/login${query}`);
      return;
    }

    if (roleNorm === "admin") {
      const adminRedirect = safeRedirect || "/admin";

      router.replace(
        `/auth/login?redirect=${encodeURIComponent(adminRedirect)}&role=admin`
      );

      return;
    }

    if (roleNorm === "customer") {
      const customerRedirect = safeRedirect || "/dashboard/bookings";

      router.replace(
        `/auth/login?redirect=${encodeURIComponent(
          customerRedirect
        )}&role=customer`
      );
    }
  }, [router, roleRaw, isKnownRole, roleNorm, safeRedirect]);

  if (!roleRaw || !isKnownRole) {
    return (
      <main className="mx-auto max-w-lg px-4 py-10">
        <h1 className="text-3xl font-bold tracking-tight text-zinc-950 dark:text-zinc-50">
          Shalean Login
        </h1>

        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
          Choose your account type to continue.
        </p>

        <div className="mt-6">
          <AuthRoleChoiceScreen redirect={safeRedirect || null} />
        </div>
      </main>
    );
  }

  return <RedirectingMessage />;
}

export default function RoleLoginRouterPage() {
  return (
    <Suspense fallback={<RedirectingMessage />}>
      <RoleLoginRouterPageInner />
    </Suspense>
  );
}
