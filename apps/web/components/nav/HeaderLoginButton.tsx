"use client";

import Link from "next/link";
import { Suspense, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, ChevronDown, LogIn, LogOut, UserPlus, UserRound } from "lucide-react";
import { useAuth } from "@/lib/auth/useAuth";
import { signOut } from "@/lib/auth/authClient";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading } = useAuth();

  const redirectTarget = useMemo(() => {
    const q = searchParams.toString();
    return `${pathname}${q ? `?${q}` : ""}`;
  }, [pathname, searchParams]);

  const loginHref = `/auth/login?redirect=${encodeURIComponent(redirectTarget)}`;
  const signupHref = `/auth/signup?redirect=${encodeURIComponent(redirectTarget)}`;

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
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(
              "group relative inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-full border px-2.5 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:px-3",
              user
                ? "border-emerald-200 bg-emerald-50 text-slate-800 hover:border-emerald-300 hover:bg-emerald-100"
                : "border-primary/20 bg-primary/10 text-primary hover:border-primary/35 hover:bg-primary/15",
              className,
            )}
            aria-label={user ? `Signed in${user.email ? ` as ${user.email}` : ""}. Open account menu.` : "Not signed in. Open account menu."}
          >
            <span className="relative inline-flex h-5 w-5 shrink-0 items-center justify-center">
              {user ? <UserRound className="h-5 w-5" aria-hidden /> : <LogIn className="h-5 w-5" aria-hidden />}
              {user ? (
                <span
                  className="absolute -bottom-1 -right-1 h-2.5 w-2.5 rounded-full border-2 border-emerald-50 bg-emerald-500"
                  aria-hidden
                />
              ) : null}
            </span>
            <span className="hidden sm:inline">{user ? "Account" : "Sign in"}</span>
            <ChevronDown className="h-3.5 w-3.5 opacity-60" aria-hidden />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" sideOffset={8} className="w-56 rounded-2xl p-2 shadow-[var(--ui-shadow-lg)]">
          {user ? (
            <>
              <DropdownMenuLabel className="truncate px-3 text-xs font-medium text-muted-foreground">
                {user.email ?? "Signed in"}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild className="gap-2 rounded-xl">
                <Link href="/account">
                  <UserRound className="h-4 w-4" aria-hidden />
                  My account
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild className="gap-2 rounded-xl">
                <Link href="/account/bookings">
                  <CalendarDays className="h-4 w-4" aria-hidden />
                  My bookings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="gap-2 rounded-xl text-red-600 focus:text-red-600"
                onSelect={(event) => {
                  event.preventDefault();
                  void signOut().then(() => {
                    router.refresh();
                  });
                }}
              >
                <LogOut className="h-4 w-4" aria-hidden />
                Sign out
              </DropdownMenuItem>
            </>
          ) : (
            <>
              <DropdownMenuItem asChild className="gap-2 rounded-xl">
                <Link href={loginHref}>
                  <LogIn className="h-4 w-4" aria-hidden />
                  Sign in
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild className="gap-2 rounded-xl">
                <Link href={signupHref}>
                  <UserPlus className="h-4 w-4" aria-hidden />
                  Create account
                </Link>
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
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
