"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { signOut } from "@/lib/auth/authClient";
import { useAuth } from "@/lib/auth/useAuth";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
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

function avatarLetter(user: User | null, cleanerLoggedIn: boolean): string {
  if (cleanerLoggedIn && !user) return "C";
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
  const [cleanerLoggedIn, setCleanerLoggedIn] = useState(false);

  useEffect(() => {
    const sb = getSupabaseBrowser();
    if (!sb) {
      setCleanerLoggedIn(false);
      return;
    }
    const sync = () => {
      void sb.auth.getSession().then(({ data }) => {
        setCleanerLoggedIn(Boolean(data.session?.access_token));
      });
    };
    sync();
    const { data: sub } = sb.auth.onAuthStateChange(() => sync());
    return () => sub.subscription.unsubscribe();
  }, []);

  const redirectTarget = useMemo(() => {
    const q = searchParams.toString();
    return `${pathname}${q ? `?${q}` : ""}`;
  }, [pathname, searchParams]);

  const loginHref = `/auth/login?redirect=${encodeURIComponent(redirectTarget)}`;
  const loggedIn = Boolean(user || cleanerLoggedIn);
  const accountHref = user ? "/account" : "/jobs";
  const avatarName = user ? userDisplayName(user) : "Cleaner account";
  const avatarPhoto = user ? avatarImageUrl(user) : null;
  const avatarInitial = avatarLetter(user, cleanerLoggedIn);
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
            ? "h-11 w-[4.75rem] rounded-full bg-[#DBEAFE]"
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
            ? "inline-flex min-h-11 items-center justify-center rounded-full bg-[var(--navy-from)] px-5 py-2.5 text-sm text-white shadow-[var(--ui-shadow-sm)] hover:bg-[var(--navy-to)]"
            : "rounded-lg border border-white/35 px-3 py-1 text-xs text-white hover:bg-white/10",
        )}
      >
        Log in
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
              ? "h-11 w-11 ring-1 ring-border hover:bg-[#EFF6FF]"
              : "h-8 w-8 ring-2 ring-white/25 hover:ring-white/50 focus-visible:ring-white/60",
          )}
          aria-label="Account menu"
        >
          <Avatar className={cn(headerVariant ? "h-10 w-10 border-border" : "h-7 w-7 border-white/30")}>
            {avatarPhoto ? <AvatarImage src={avatarPhoto} alt="" referrerPolicy="no-referrer" /> : null}
            <AvatarFallback
              className={cn(
                "text-xs font-semibold",
                headerVariant ? "bg-[var(--navy-from)] text-white" : "bg-white/15 text-white",
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
          <Link href={accountHref}>{user ? "My Account" : "Cleaner Workspace"}</Link>
        </DropdownMenuItem>
        {user ? (
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
          ? "h-11 w-[4.75rem] rounded-full bg-[#DBEAFE]"
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
