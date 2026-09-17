"use client";

import Link from "next/link";
import { Suspense, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { signOut } from "@/lib/auth/authClient";
import { useAuth } from "@/lib/auth/useAuth";
import { readCachedUserRole } from "@/lib/auth/userRole";
import {
  publicHeaderAccountLabel,
  publicHeaderDashboardHref,
  publicHeaderPostAuthRedirect,
  publicHeaderShowsCustomerBookings,
  publicHeaderUsesDirectDashboardLink,
} from "@/lib/auth/publicHeaderAuthRouting";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

type SiteTopBarAccountVariant = "topbar" | "header";

function userDisplayName(user: User | null): string {
  const meta = user?.user_metadata as Record<string, unknown> | undefined;
  const name =
    (typeof meta?.full_name === "string" && meta.full_name.trim()) ||
    (typeof meta?.name === "string" && meta.name.trim()) ||
    "";
  return name || user?.email || "Account";
}

function avatarLetter(user: User | null): string {
  return userDisplayName(user).trim()[0]?.toUpperCase() ?? "S";
}

function avatarImageUrl(user: User | null): string | null {
  const meta = user?.user_metadata as Record<string, unknown> | undefined;
  const avatarUrl = meta?.avatar_url;
  const picture = meta?.picture;
  if (typeof avatarUrl === "string" && avatarUrl.startsWith("http")) return avatarUrl;
  if (typeof picture === "string" && picture.startsWith("http")) return picture;
  return null;
}

function SiteTopBarAccountInner({ variant }: { variant: SiteTopBarAccountVariant }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const redirectTarget = useMemo(
    () => publicHeaderPostAuthRedirect(pathname, searchParams.toString()),
    [pathname, searchParams],
  );

  const loginHref = `/auth/login?redirect=${encodeURIComponent(redirectTarget)}`;
  const loggedIn = Boolean(user);
  const cachedRole = readCachedUserRole();
  const accountHref = publicHeaderDashboardHref(cachedRole);
  const accountLabel = publicHeaderAccountLabel(cachedRole);
  const showCustomerBookings = publicHeaderShowsCustomerBookings(cachedRole);
  const avatarName = userDisplayName(user);
  const avatarPhoto = avatarImageUrl(user);
  const avatarInitial = avatarLetter(user);
  const headerVariant = variant === "header";

  async function handleLogout() {
    if (user) await signOut();
    if (typeof window !== "undefined") localStorage.removeItem("cleaner_id");
    router.push("/");
    router.refresh();
  }

  if (loading) {
    return (
      <div
        className={cn(
          "shrink-0 animate-pulse",
          headerVariant
            ? "h-11 w-[4.75rem] rounded-full bg-primary/25"
            : "h-7 w-14 rounded-lg bg-white/20",
        )}
        aria-hidden
      />
    );
  }

  if (!loggedIn) {
    return (
      <Link
        href={loginHref}
        className={cn(
          "shrink-0 font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
          headerVariant
            ? "inline-flex min-h-11 items-center justify-center rounded-full bg-primary px-5 py-2.5 text-sm text-primary-foreground shadow-[var(--ui-shadow-sm)] hover:brightness-95"
            : "rounded-lg border border-white/35 px-3 py-1 text-xs text-white hover:bg-white/10",
        )}
      >
        Log In
      </Link>
    );
  }

  if (publicHeaderUsesDirectDashboardLink(variant)) {
    return (
      <Link
        href={accountHref}
        className="inline-flex h-11 w-11 items-center justify-center rounded-full outline-none ring-1 ring-border transition hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        aria-label={`Open ${accountLabel}`}
      >
        <Avatar className="h-10 w-10 border-border">
          {avatarPhoto ? <AvatarImage src={avatarPhoto} alt="" referrerPolicy="no-referrer" /> : null}
          <AvatarFallback className="bg-primary text-xs font-semibold text-primary-foreground">
            {avatarInitial}
          </AvatarFallback>
        </Avatar>
      </Link>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center justify-center rounded-full outline-none transition focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
            headerVariant
              ? "h-11 w-11 ring-1 ring-border hover:bg-primary/10"
              : "h-8 w-8 ring-2 ring-white/25 hover:ring-white/50 focus-visible:ring-white/60",
          )}
          aria-label="Account menu"
        >
          <Avatar className={cn(headerVariant ? "h-10 w-10 border-border" : "h-7 w-7 border-white/30")}>
            {avatarPhoto ? <AvatarImage src={avatarPhoto} alt="" referrerPolicy="no-referrer" /> : null}
            <AvatarFallback
              className={cn(
                "text-xs font-semibold",
                headerVariant ? "bg-primary text-primary-foreground" : "bg-white/15 text-white",
              )}
            >
              {avatarInitial}
            </AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[220px] rounded-2xl p-2 shadow-[var(--ui-shadow-lg)]">
        <DropdownMenuLabel className="px-3 py-2">
          <span className="block truncate text-sm">{avatarName}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href={accountHref}>{accountLabel}</Link>
        </DropdownMenuItem>
        {showCustomerBookings ? (
          <DropdownMenuItem asChild>
            <Link href="/account/bookings">My Bookings</Link>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-red-600 focus:bg-red-50 focus:text-red-700"
          onSelect={(event) => {
            event.preventDefault();
            void handleLogout();
          }}
        >
          Logout
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SiteTopBarAccountFallback({ variant }: { variant: SiteTopBarAccountVariant }) {
  return (
    <div
      className={cn(
        "shrink-0 animate-pulse",
        variant === "header"
          ? "h-11 w-[4.75rem] rounded-full bg-primary/25"
          : "h-7 w-14 rounded-lg bg-white/20",
      )}
      aria-hidden
    />
  );
}

export function SiteTopBarAccount({ variant = "topbar" }: { variant?: SiteTopBarAccountVariant }) {
  return (
    <Suspense fallback={<SiteTopBarAccountFallback variant={variant} />}>
      <SiteTopBarAccountInner variant={variant} />
    </Suspense>
  );
}
