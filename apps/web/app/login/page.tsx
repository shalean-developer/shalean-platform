"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthRoleChoiceScreen } from "@/components/auth/AuthRoleChoiceScreen";
import { AuthLegalFooter, AuthCard } from "@/components/auth/AuthShell";

function RedirectingMessage() {
  return (
    <AuthCard>
      <p className="text-center text-sm text-zinc-600 dark:text-zinc-300">Redirecting…</p>
    </AuthCard>
  );
}

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
      const target = safeRedirect && safeRedirect.startsWith("/jobs") ? safeRedirect : "/jobs";
      router.replace(`/cleaner/login?redirect=${encodeURIComponent(target)}`);
      return;
    }

    const defaultRedirect =
      roleNorm === "admin" ? "/office" : roleNorm === "customer" ? "/account" : "/account";
    const targetRedirect = safeRedirect || defaultRedirect;
    const intent = roleNorm === "admin" ? "customer" : roleNorm;
    router.replace(`/auth/login?redirect=${encodeURIComponent(targetRedirect)}&intent=${encodeURIComponent(intent)}`);
  }, [router, roleRaw, isKnownRole, roleNorm, safeRedirect]);

  if (roleRaw && isKnownRole) {
    return <RedirectingMessage />;
  }

  return (
    <>
      <AuthRoleChoiceScreen redirect={safeRedirect || null} />
      <AuthLegalFooter />
    </>
  );
}

export default function RoleLoginRouterPage() {
  return (
    <Suspense fallback={<RedirectingMessage />}>
      <RoleLoginRouterPageInner />
    </Suspense>
  );
}
