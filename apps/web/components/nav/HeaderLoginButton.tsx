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
  /** Render a compact avatar control instead of the labelled header button. */
  avatarOnly?: boolean;
};

const buttonClass =
  "inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-700 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700";

function HeaderLoginButtonInner({ className, showLabel = false, avatarOnly = false }: Props) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user, loading } = useAuth();

  const redirectTarget = useMemo(() => {
    const q = searchParams.toString();
    return `${pathname}${q ? `?${q}` : ""}`;
  }, [pathname, searchParams]);

  const loginHref = `/auth/login?redirect=${encodeURIComponent(redirectTarget)}`;

  if (loading) {
    return (
      <div
        className={cn(
          "animate-pulse bg-slate-100",
          avatarOnly ? "h-10 w-10 rounded-full" : "h-9 w-16 rounded-xl",
          className,
        )}
        aria-hidden
      />
    );
  }

  if (avatarOnly) {
    return (
      <Link
        href={user ? "/account" : loginHref}
        className={cn(
          "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-primary/20 bg-primary/10 text-primary transition hover:border-primary/35 hover:bg-primary/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          className,
        )}
        aria-label={user ? "Your account" : "Login"}
      >
        <UserRound className="h-5 w-5" aria-hidden />
      </Link>
    );
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

function HeaderLoginButtonFallback({ className, showLabel = false, avatarOnly = false }: Props) {
  return (
    <div
      className={cn(
        "animate-pulse bg-slate-100",
        avatarOnly ? "h-10 w-10 rounded-full" : "h-9 w-16 rounded-xl",
        className,
      )}
      aria-hidden={!showLabel}
    />
  );
}

export function HeaderLoginButton(props: Props) {
  return (
    <Suspense fallback={<HeaderLoginButtonFallback {...props} />}>
      <HeaderLoginButtonInner {...props} />
    </Suspense>
  );
}
