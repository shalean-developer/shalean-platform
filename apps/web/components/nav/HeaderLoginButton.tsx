"use client";

import Link from "next/link";
import { Suspense, useMemo } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { LogIn, UserRound } from "lucide-react";
import { useAuth } from "@/lib/auth/useAuth";
import { cn } from "@/lib/utils";

type Props = {
  className?: string;
  /** Always show text label (e.g. mobile nav drawer). */
  showLabel?: boolean;
};

const buttonClass =
  "inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-700 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700";

function HeaderLoginButtonInner({ className, showLabel = false }: Props) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user, loading } = useAuth();

  const redirectTarget = useMemo(() => {
    const q = searchParams.toString();
    return `${pathname}${q ? `?${q}` : ""}`;
  }, [pathname, searchParams]);

  const loginHref = `/auth/login?redirect=${encodeURIComponent(redirectTarget)}`;

  if (loading) {
    return <div className={cn("h-9 w-16 animate-pulse rounded-xl bg-slate-100", className)} aria-hidden />;
  }

  if (user) {
    return (
      <Link href="/account" className={cn(buttonClass, className)} aria-label="Your account">
        <UserRound className="h-4 w-4 shrink-0" aria-hidden />
        <span className={showLabel ? "inline" : "hidden sm:inline"}>Account</span>
      </Link>
    );
  }

  return (
    <Link href={loginHref} className={cn(buttonClass, className)} aria-label="Login">
      <LogIn className="h-4 w-4 shrink-0" aria-hidden />
      <span className={showLabel ? "inline" : "hidden sm:inline"}>Login</span>
    </Link>
  );
}

function HeaderLoginButtonFallback({ className, showLabel = false }: Props) {
  return <div className={cn("h-9 w-16 animate-pulse rounded-xl bg-slate-100", className)} aria-hidden={!showLabel} />;
}

export function HeaderLoginButton(props: Props) {
  return (
    <Suspense fallback={<HeaderLoginButtonFallback {...props} />}>
      <HeaderLoginButtonInner {...props} />
    </Suspense>
  );
}
